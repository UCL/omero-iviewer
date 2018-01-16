from collections import defaultdict
import timeit

from django.http import JsonResponse

from omero.gateway import _ImageWrapper, TagAnnotationWrapper
from omero.rtypes import rlong, rlist, rstring
from omero.sys import Parameters
from omeroweb.decorators import login_required

# Constants for TagAnnotation names related to ROI annotating
FASTMAL_TAG_PREFIX = 'FASTMAL_'
FASTMAL_DATASET_ANNOTATE_TAG = FASTMAL_TAG_PREFIX + 'ANNOTATE'
FASTMAL_IMAGE_ANNOTATE_TAG = FASTMAL_TAG_PREFIX + 'ANNOTATE'
FASTMAL_IMAGE_ROI_COMPLETE_TAG = FASTMAL_TAG_PREFIX + 'ROI_COMPLETE'

@login_required()
def fastmal_roi_complete_tag(request, image_id, state, conn=None, **kwargs):
    """ Endpoint for /iviewer/fastmal_roi_complete_tag/<image id>/<true or false>/
        A convenient route to add the 'FASTMAL_ROI_COMPLETE' tag to images. This
        will get the relevant tag annotation reference for the current context and
        add/remove the link as required
    """
    # Switch to the active group to get the tags in this dataset
    original_group = conn.getGroupFromContext()
    conn.setGroupForSession(request.session['active_group'])

    # Get reference to the ROI_COMPLETE tag
    roi_complete_tag = [t for t in conn.getObjects("TagAnnotation") if t.getValue() == FASTMAL_IMAGE_ROI_COMPLETE_TAG][0]

    # Get the ImageAnnotationLink, if any, and filter by current user
    links = roi_complete_tag.getParentLinks("Image", [image_id])
    links = [a for a in links if a.getOwner().getId() == conn.getUser().getId()]

    # If we have link between tag and image, and we want to remove
    if len(links) and state == "false":
        ids = [l._obj.id.val for l in links]
        conn.deleteObjects("ImageAnnotationLink", ids)
        msg = "Had link, removed";
    # If we don't have link between tag and image, and we want to add
    elif len(links) == 0 and state == "true":
        image = conn.getObject("Image", image_id)
        image.linkAnnotation(roi_complete_tag)
        msg = "Did not have link, added"
    else:
        msg = "Nothing to do"

    # Set the session context back to the original group (being cautious!)
    conn.setGroupForSession(original_group)

    return JsonResponse({'msg': msg})


@login_required()
def fastmal_user(request, conn=None, **kwargs):
    """ Endpoint for /iviewer/fastmal_user/ which returns a JSON response containing
        information about current logged in user
    """
    try:
        user = conn.getUser()
        user_id = user.getId()
        user_fullname = user.getFullName()
        user_name = user.getName()
        user_current_id = request.session['user_id']
        response = { 'id' : user_id,
                'name' : user_name,
                'fullname' : user_fullname,
                'current_id' : user_current_id}
        return JsonResponse(response)
    except Exception as user_exception:
        return JsonResponse({'error': repr(user_exception)})


@login_required()
def fastmal_data(request, dataset_id, conn=None, **kwargs):
    """ Endpoint for /iviewer/fastmal_data/<dataset id>/
        Runs multiple queries related to current ROI annotation of images in
        the specified dataset, for the logged in user. ROI counts, images
        annotated etc. Packs them up and returns JSON response
    """
    start_time = timeit.default_timer()

    # Make sure we have a valid dataset
    dataset = conn.getObject("Dataset", dataset_id)
    if dataset is None:
        return JsonResponse({"error": "Dataset not found"}, status=404)

    # We do not annotate datasets if they do not have the 'ANNOTATE' tag
    dataset_tags = [a.getValue() for a in dataset.listAnnotations() if isinstance(a, TagAnnotationWrapper)]
    if FASTMAL_DATASET_ANNOTATE_TAG not in dataset_tags:
        return JsonResponse({"error": "Dataset does not have 'annotate' flag"}, status=500)

    try:
        # Don't overwrite the original (being cautious!)
        service_opts = conn.SERVICE_OPTS.copy()

        # 1. Get all annotable images in dataset
        qs = conn.getQueryService()
        # TODO: Tried omero.sys.Parameters, but did not work
        roiable_in_dataset = qs.projection("""select ial.parent
                from ImageAnnotationLink as ial
                    inner join ial.child as annotation
                where annotation.textValue = '%s' and ial.child.class IS TagAnnotation
                and ial.parent in (
                    select child.id from DatasetImageLink where parent = %d
                )""" % (FASTMAL_IMAGE_ANNOTATE_TAG, int(dataset_id)), None, service_opts)

        roiable_in_dataset = (r[0].getValue().id.getValue() for r in roiable_in_dataset)

        # Prepare a list of ROI annotable images in this dataset, put in a Parameter obj
        image_ids = list(roiable_in_dataset)
        params = Parameters()
        params.map = {}
        params.map["iids"] = rlist([rlong(o) for o in set(image_ids)])
        params.map["oid"] = rlong(conn.getUser().getId())

        # 2. Get the summary ROI type counts across the dataset, for this user
        dataset_totals = qs.projection("""select s.textValue, count(s.textValue)
                from Shape as s where s.roi.image in (
                    from Image where id in (:iids)
                )
                and s.details.owner.id = :oid
                group by s.textValue""", params, service_opts)
        dataset_totals = { d[0].getValue(): d[1].getValue() for d in dataset_totals}

        # 3. Get rois per image in this dataset, for this user
        images_in_dataset_rois = qs.projection("""
                select s.roi.image.id, s.textValue, count(s.roi.image.id)
                from Shape s
                where s.roi.image in (
                    from Image where id in (:iids)
                )
                and s.details.owner.id = :oid
                group by s.roi.image.id, s.textValue
                """, params, service_opts)
        rois_per_image = defaultdict(lambda: defaultdict(int))
        for row in images_in_dataset_rois:
            rois_per_image[long(row[0].getValue())][row[1].getValue()] = row[2].getValue()

        # 4. Get number of images with particular annotations, for this user
        images_per_roi = qs.projection("""
            select s.textValue, count(distinct s.roi.image) from Shape s
            where s.roi.image in (
                from Image where id in (:iids)
                )
                and s.details.owner.id = :oid
                group by s.textValue
                """, params, service_opts)
        images_per_roi = { i[0].getValue(): i[1].getValue() for i in images_per_roi }

        # 5. Get images that are complete, for this user
        images_roi_complete = qs.projection("""
            select ial.parent.id from ImageAnnotationLink as ial
            inner join ial.child as annotation
            where annotation.textValue = '%s' and ial.child.class IS TagAnnotation
            and ial.parent in (from Image where id in (:iids))
            and ial.details.owner.id = :oid
            """ % FASTMAL_IMAGE_ROI_COMPLETE_TAG, params, service_opts)
        images_roi_complete = {i[0].getValue(): 0 for i in images_roi_complete}

        elapsed = timeit.default_timer() - start_time

        response = { 'image_ids': image_ids,
                'roi_type_count': dataset_totals,
                'execution_time': elapsed,
                'images_with_rois': rois_per_image,
                'images_per_roi': images_per_roi,
                'images_roi_complete': images_roi_complete}

        return JsonResponse(response)
    except Exception as dataset_rois_exception:
        return JsonResponse({'error': repr(dataset_rois_exception)})

