import ast
from collections import defaultdict
import json
import timeit

from django.http import JsonResponse

from omero.gateway import _ImageWrapper, TagAnnotationWrapper, MapAnnotationWrapper, CommentAnnotationWrapper
from omero.model import FileAnnotationI
from omero.rtypes import rlong, rlist, rstring
from omero.sys import Parameters
from omeroweb.decorators import login_required

# Constants for TagAnnotation names related to ROI annotating
FASTMAL_TAG_PREFIX = 'FASTMAL_'
FASTMAL_DATASET_ANNOTATE_TAG = FASTMAL_TAG_PREFIX + 'ANNOTATE'
FASTMAL_IMAGE_ANNOTATE_TAG = 'EDOF_RGB'
FASTMAL_IMAGE_ROI_COMPLETE_TAG = FASTMAL_TAG_PREFIX + 'ROI_COMPLETE'
FASTMAL_PROJECT_ROI_LABEL_SUFFIX = '_RoiLabels.json'

@login_required()
def fastmal_shape_annotation(request, shape_id, key, value_new=None, conn=None, **kwargs):
    """
    Handles adding/change (not removing) map annotations to shapes
    """
    # Switch to the active group to get the tags in this dataset
    original_group_id = conn.getGroupFromContext().getId()
    if 'active_group' in request.session:
        conn.setGroupForSession(request.session['active_group'])
    current_group_id = conn.getGroupFromContext().getId()
    conn.SERVICE_OPTS.setOmeroGroup(current_group_id)

    # Get shape
    shape = conn.getObject('Shape', shape_id)

    # If shape exists
    if shape:
        msg = ''

        # See if the annotation already exists for this shape
        annotations = conn.getAnnotationLinks('Shape', [shape_id])
        map_ann = None
        for annotation in annotations:
            check_ann = annotation.getAnnotation()
            if isinstance(check_ann, MapAnnotationWrapper):
                if check_ann.getValue()[0][0] == key:
                    map_ann = check_ann
                    msg = 'MapAnnotation found'
                    break

        # If we're setting annotation
        if key and value_new:
            # If annotation exists
            if map_ann:
                # Edit annotation
                map_ann.setValue([[key, value_new]])
                map_ann.save()
                msg = 'MapAnnotation exists; updated value.'
            # Otherwise annotation deson't exists
            else:
                # Create and save annotation
                map_ann = MapAnnotationWrapper(conn)
                map_ann.setValue([[key, value_new]])
                map_ann.save()
                shape.linkAnnotation(map_ann)
                msg = 'MapAnnotation created.'

        # Set the session context back to the original group (being cautious!)
        if 'active_group' in request.session:
            conn.setGroupForSession(original_group_id)

        # Return the annotation
        if map_ann:
            return JsonResponse({'msg': msg, 'annotation': map_ann.getValue()[0]})
        else:
            return JsonResponse({'error': 'Annotation not found'})
    else:
        # return shape not found
        return JsonResponse({'error': 'Shape not found'})

@login_required()
def fastmal_image_roi_comments(request, image_id, conn=None, **kwargs):
    if 'active_group' in request.session:
        conn.setGroupForSession(request.session['active_group'])
    current_group_id = conn.getGroupFromContext().getId()
    conn.SERVICE_OPTS.setOmeroGroup(current_group_id)

    qs = conn.getQueryService()

    params = Parameters()
    params.map = {}
    params.map["id"] = rlong(image_id)

    rois_in_image = qs.findAllByQuery("""select r from Roi r 
        join fetch r.annotationLinks as roiAnnotationLink
        join fetch roiAnnotationLink.child
        where r.image.id = :id""", params)

    d = defaultdict(list)

    # collect the results
    for roi_in_image in rois_in_image:
        for annotation_link_for_roi in roi_in_image.iterateAnnotationLinks():
            d[str(roi_in_image.id.val)].append(annotation_link_for_roi.child.textValue.val)

    # sort comments for consistent display
    for key, value in d.items():
        d[key] = sorted(value)

    return JsonResponse(dict(d))

@login_required()
def fastmal_roi_comment(request, roi_id, comments, conn=None, **kwargs):
    """Links CommentAnnotation from ucl.ac.uk/fastmal/roi namespace to an Roi.

    Endpoint for /iviewer/fastmal_roi_comment/roi_id/comments (list separated)
    Creates the CommentAnnotation if it doesn't already exist
    Comment argument can be comma-separated list of comments
    """
    # Switch to the active group
    original_group_id = conn.getGroupFromContext().getId()
    if 'active_group' in request.session:
        conn.setGroupForSession(request.session['active_group'])
    current_group_id = conn.getGroupFromContext().getId()
    conn.SERVICE_OPTS.setOmeroGroup(current_group_id)

    # Get Roi
    roi = conn.getObject('Roi', roi_id)

    # TODO: If roi doesn't exist, return error
    if roi is None:
        return JsonResponse({'error': 'roi with id ' + roi_id + ' not found'})

    # Get Roi existing comment annotations
    roi_existing_comments = [x.getTextValue() for x in roi.listAnnotations() if isinstance(x, CommentAnnotationWrapper)]

    # Comment is sent in Unicode but CommentAnnotations are str, convert to match
    comments = set(str(comments).split(','))

    # Get all CommentAnnotations for roi
    namespace = 'ucl.ac.uk/fastmal/roi'
    existing_comments = {x.getValue(): x for x in conn.getObjects('CommentAnnotation') if x.getNs() == namespace}

    # For each comment to link to roi
    for comment in comments:
        # Skip if the comment already exists
        if comment in roi_existing_comments:
            continue

        # Create and add the comment to OMERO if it doesn't exist
        if comment not in existing_comments:
            c = CommentAnnotationWrapper(conn)
            c.setTextValue(rstring(comment))
            c.setNs(namespace)
            c.save
            existing_comments[c.getValue()] = c

        roi.linkAnnotation(existing_comments[comment])

    return JsonResponse({'roi_id': roi.id, 'success': True, 'comments': list(comments)})


@login_required()
def fastmal_roi_comment2(request, conn=None, **kwargs):
    """Links CommentAnnotation from ucl.ac.uk/fastmal/roi namespace to an Roi.

    Endpoint for /iviewer/fastmal_roi_comment/roi_id/comments (list separated)
    Creates the CommentAnnotation if it doesn't already exist
    Comment argument can be comma-separated list of comments
    """
    # Switch to the active group
    original_group_id = conn.getGroupFromContext().getId()
    if 'active_group' in request.session:
        conn.setGroupForSession(request.session['active_group'])
    current_group_id = conn.getGroupFromContext().getId()
    conn.SERVICE_OPTS.setOmeroGroup(current_group_id)

    data = json.loads(request.body)

    return JsonResponse({"data": data}, safe=False)


@login_required()
def fastmal_roi_complete_tag(request, image_id, state, conn=None, **kwargs):
    """ Endpoint for /iviewer/fastmal_roi_complete_tag/<image id>/<true or false>/
        A convenient route to add the 'FASTMAL_ROI_COMPLETE' tag to images. This
        will get the relevant tag annotation reference for the current context and
        add/remove the link as required
    """
    original_group_id = conn.getGroupFromContext().getId()
    # Switch to the active group to get the tags in this dataset
    if 'active_group' in request.session:
        conn.setGroupForSession(request.session['active_group'])
    current_group_id = conn.getGroupFromContext().getId()

    # Get reference to the FASTMAL_ROI_COMPLETE tag in this group
    roi_complete_tag = [t for t in conn.getObjects("TagAnnotation") if t.getValue() == FASTMAL_IMAGE_ROI_COMPLETE_TAG and t.getDetails().getGroup().getId() == current_group_id]
    if len(roi_complete_tag) != 1:
        return JsonResponse({'error': ','.join([str((t.getId, t.getDetails().getGroup())) for t in roi_complete_tag])})
    roi_complete_tag = roi_complete_tag[0]

    # Get the ImageAnnotationLink, if any, and filter by current user
    links = roi_complete_tag.getParentLinks("Image", [image_id])
    links = [a for a in links if a.getOwner().getId() == conn.getUser().getId()]

    hasTag = state == "true"

    # If we have link between tag and image, and we want to remove
    if len(links) and not hasTag:
        ids = [l._obj.id.val for l in links]
        # TODO: why isn't conn.deleteObject(link[0]) working?
        conn.deleteObjects("ImageAnnotationLink", ids, wait=True)
        msg = "Had link, removed";
    # If we don't have link between tag and image, and we want to add
    elif len(links) == 0 and hasTag:
        image = conn.getObject("Image", image_id)
        image.linkAnnotation(roi_complete_tag)
        msg = "Did not have link, added"
    else:
        msg = "Nothing to do"

    # Set the session context back to the original group (being cautious!)
    if 'active_group' in request.session:
        conn.setGroupForSession(original_group_id)

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

        sorted_images = qs.projection("""select i.id 
                                         from Image as i 
                                         where i.id in (%s) 
                                         order by i.name""" % ','.join([str(x) for x in image_ids]), None, service_opts)
        sorted_images = (r[0].getValue() for r in sorted_images)
        image_ids = list(sorted_images)

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

        # 6. Get the ROI labels for this tree
        # TODO: handle dataset being in multiple projects
        project = dataset.getParent()
        project_ann = project.listAnnotations()
        label_filename = project.name + FASTMAL_PROJECT_ROI_LABEL_SUFFIX
        file_ann = [pa for pa in project_ann 
                if pa.OMERO_TYPE == FileAnnotationI 
                and pa.getFileName() == label_filename]
        label_json = "".join(file_ann[0].getFileInChunks())
        label_json = label_json.replace('\n', '')
        label_json = ast.literal_eval(label_json)

        elapsed = timeit.default_timer() - start_time

        response = {'image_ids': image_ids,
                'roi_type_count': dataset_totals,
                'execution_time': elapsed,
                'images_with_rois': rois_per_image,
                'images_per_roi': images_per_roi,
                'images_roi_complete': images_roi_complete,
                'dataset_name': dataset.name,
                'project_roi_labels': label_json}

        return JsonResponse(response)
    except Exception as dataset_rois_exception:
        return JsonResponse({'error': repr(dataset_rois_exception)})

