/**
 * FASt-Mal modifications to omero-iviewer code.
 *
 * Usage is peppered throughout the omero-iviewer code
 */

import {Converters} from '../utils/converters';

// Constants for publish/subscribe events
export const FASTMAL_DESELECTED = "FASTMAL_DESELECTED";
export const FASTMAL_SELECTED = "FASTMAL_SELECTED";
export const FASTMAL_COMMENT_UPDATE = "FASTMAL_COMMENT_UPDATE";
export const FASTMAL_COUNT_UPDATE = "FASTMAL_COUNT_UPDATE";
export const FASTMAL_THUMBNAIL_REFRESH = "FASTMAL_THUMBNAIL_REFRESH";

export default class FastMal {

    // Reference to global iviewer context
    context = null;

    /**
     * Used by regions-edit.html to bind the currently selected type
     */
    fastmal_roi_types = null;
    fastmal_selected_roi_complete = null;
    fastmal_inprogress_images = [];

    fastmal_roi_tree_element = null;

    /**
     * Stores the current active shape
     */
    fastmal_last_active_shape = 0; // rectangle

    /**
     * Holds the ROI information about a given dataset
     */
    datasetRoiCounts = null;

    /**
     * A list of nice colours to use for ROIs
     */
    lineColours = [ "230,25,75", "60,180,75", "255,225,25", "0,130,200", 
        "245,130,48", "145,30,180", "70,240,240", "240,50,230", 
        "210,245,60", "250,190,190", "0,128,128", "230,190,255", 
        "170,110,40", "255,250,200", "128,0,0", "170,255,195", 
        "128,128,0", "255,215,180", "0,0,128", "128,128,128" ];

    static get NO_ROI_LABELS_DEFINED() {
        return [
            { name: 'Off', code: 'FASTMAL:NULL', id: 0 }
        ];
    }

    constructor(context) {
        this.context = context;
        // by default, use thick film types
        this.fastmal_roi_types = FastMal.NO_ROI_LABELS_DEFINED;
        this.setUserInfo();
        console.log('Instantiated FastMal');
    }

    userInfo = null;

    /**
     * Requests the logged in user's information and stores it locally
     * (used to filter ROIs by user)
     */
    setUserInfo() {
        $.ajax({
            url : '/iviewer/fastmal_user/',
            type: 'GET',
            dataType: 'json',
            async : true,
            success : (response) => {
                try {
                    this.userInfo = response;
                } catch(err) {
                    console.error("Failed to userInfo");
                    this.userInfo = err.responseJSON;
                }
            }, 
             error: (jqxhr, status, exception) => {
                console.error("Failed to load userInfo");
                console.error(`jqxhr[${jqxhr}]; status[${status}]; exception[${exception}];`);
                this.userInfo = exception;
             }
        });
    }


    /**
     * Returns the ROI types valid for this type of image
     */
    getRoiTypes() {
        return this.datasetRoiCounts.project_roi_labels;
    }

    /**
     * Iterates over all ROIs in regions_info and tallies the ROI Type
     */
    getRoiTypeCounts(regions_info) {
        let data = regions_info.data;
        let count = {};
        data.forEach(
            (value) => value.shapes.forEach(
                    (value) => {
                        let code = value.Text;
                        count[code] = count[code] ? count[code] + 1 : 1;
                    })
        );
        return count;
    }

    /**
     * Called by regions-list.js when ROI list changes.
     */
    getRoiTypeCountsHTML(regions_info) {
        if (this.context.getSelectedImageConfig().image_info.image_id.toString() in this.datasetRoiCounts['images_roi_complete']) {
            this.fastmal_selected_roi_complete = true;
        } else {
            this.fastmal_selected_roi_complete = false;
        }
        const counts = this.getRoiTypeCounts(regions_info);
        const roi_types = this.getRoiTypes();
        this.fastmal_roi_types = roi_types;
        let html = "";
        // total = ROI type counts for image; grandTotal = ROI type counts for dataset
        let total, grandTotal, iCount;
        const datasetCounts = this.datasetRoiCounts['roi_type_count'];
        const imageCounts = this.datasetRoiCounts['images_per_roi'];
        for (let i = 1; i < roi_types.length; i++) {
            total = counts[roi_types[i].code] ? counts[roi_types[i].code] : 0;
            grandTotal = datasetCounts[roi_types[i].code] ? datasetCounts[roi_types[i].code] : 0;
            iCount = imageCounts[roi_types[i].code] ? imageCounts[roi_types[i].code] : 0;
            html += roi_types[i].name + ": " + total + " of " + grandTotal + " from " + iCount + "; ";
        }
        return html;
    }

    /**
     * Return an array counting counts of each ROI type for a given image ID
     * Used in thumbnail slider view
     */
    getRoiTypeCountsForImage(image_id) {
        const roi_types = this.getRoiTypes();
        this.fastmal_roi_types = roi_types;
        let counts = [];
        if (image_id in this.datasetRoiCounts["images_with_rois"]) {
            const lookup = this.datasetRoiCounts["images_with_rois"][image_id.toString()];
            for (let i = 1; i < roi_types.length; i++) {
                counts.push(lookup[roi_types[i].code] ? lookup[roi_types[i].code] : 0);
            }
        } else {
            for (let i = 1; i < roi_types.length; i++) {
                counts.push(0);
            }
        }
        return counts;
    }

    /**
     * Update FASTMAL:ROI_COMPLETE tag for this image
     */
    updateRoiCompleteTag(state) {
        $.ajax({
            url : '/iviewer/fastmal_roi_complete_tag/' + this.getRegionsInfo().image_info.image_id + '/' + state + '/',
            success : (response) => {
                try {
                    console.log('Successfully set tag');
                    this.refreshDatasetRoiCounts(null);
                    return true;
                } catch(err) {
                    console.error("Failed to set tag");
                    return false;
                }
            }, error : (error) => {
                console.error("Failed to set tag")
                return false;
            }
        });
    }


    /**
     * Get active regions_info via the Context
     */
    getRegionsInfo() {
        const image_config = this.context.getSelectedImageConfig();
        return image_config.regions_info;
    }

    /**
     * Triggered by regions-edit.js when user clicks on 'Select ROI' list
     */
    fastmalRoiClick(id) {
        return this.roiTypeSelected(id);
    }

    /**
     * Return the appropriate indicator to display next to thumbnail
     * for complete/in progress/no ROI annotations
     */
    getCompletedRoiIndicator(image_id) {
        if (image_id.toString() in this.datasetRoiCounts['images_roi_complete']) {
            return '✔';
        } else if (image_id.toString() in this.datasetRoiCounts['images_with_rois']) {
            return '✘';
        }
        return '';
    }

    /**
     * Set regions drawing default for a given type
     */
    roiTypeSelected(type_id) {
        const regions_info = this.getRegionsInfo()
        const roi_types = this.getRoiTypes();

        // deselect all nodes
        const selected = this.fastmal_roi_tree_element.tree('getState').selected_node;
        for (let i = 0; i < selected.length; i++) {
            const node = this.fastmal_roi_tree_element.tree('getNodeById', selected[i]);
            this.fastmal_roi_tree_element.tree('removeFromSelection', node);
        }

        // select only the selected node       
        const node = this.fastmal_roi_tree_element.tree('getNodeById', type_id);
        this.fastmal_roi_tree_element.tree('selectNode', node, { mustToggle: false });

        // If we're turning off ROI shapes (i.e. select mode)
        if (type_id == 0) {
            regions_info.shape_defaults.Text = '';
            regions_info.shape_to_be_drawn = null;
            this.context.publish(FASTMAL_DESELECTED, {}); // fires regions-drawing.onDrawShape()
            return true;
        }

        regions_info.shape_defaults.Text = roi_types[type_id].code;

        const rgb_string = 'rgb(' + roi_types[type_id].colour + ')';
        regions_info.shape_defaults.StrokeColor = Converters.rgbaToSignedInteger(rgb_string);

        this.context.publish(FASTMAL_SELECTED, {shape_id: this.fastmal_last_active_shape}); // fires regions-drawing.onDrawShape()
        return true;
    }

    /**
     * Retrieves ROI and tag information about a dataset and stores it
     * in instance variable
     */
    refreshDatasetRoiCounts(dataset_id, async=true) {
        if (dataset_id == null) {
            dataset_id = this.datasetRoiCounts['dataset_id'];
        }

        $.ajax({
            // this.context.getPrefixedURI(IVIEWER) is not ready...?
            url : '/iviewer/fastmal_data/' + dataset_id + '/',
            async : async, // appara
            dataType: 'json',
            success : (response) => {
                try {
                    this.datasetRoiCounts = response;
                    this.datasetRoiCounts['dataset_id'] = dataset_id;
                    this.setInProgressImageIds();

                    // add "off" to the project roi labels
                    this.datasetRoiCounts.project_roi_labels.unshift(
                        { "name": "Off", "code": "FASTMAL:NULL", "id": 0 }
                    );
                    // give each top-level roi label an id and a colour
                    for (let i = 1; i < this.datasetRoiCounts.project_roi_labels.length; i++) {
                        this.datasetRoiCounts.project_roi_labels[i]["colour"] = this.lineColours[i];
                        this.datasetRoiCounts.project_roi_labels[i]["id"] = i;
                    }

                    this.context.publish(FASTMAL_COUNT_UPDATE, {}); // fires regions-list.updateRoiCounts()
                    this.context.publish(FASTMAL_THUMBNAIL_REFRESH, {});
                } catch(err) {
                    console.error("Failed to load Rois: ");
                    this.datasetRoiCounts = err.responseJSON;
                }
            }, error : (error) => {
                console.error("Failed to load Rois: ")
                this.datasetRoiCounts = error.responseJSON;
            }
        });
    }

    /**
     * Constructs HTML links to display at top of thumbnail slide
     * Lsit of in progress images
     */
    setInProgressImageIds() {
        let image_ids = [];
        for (let image_id in this.datasetRoiCounts['images_with_rois']) {
            if (!(image_id in this.datasetRoiCounts['images_roi_complete'])) {
                image_ids.push(image_id);
            }
        }
        this.fastmal_inprogress_images = image_ids;
    }

    /**
     * Handles the updating of the range in CROWD roi annotation
     */
    updateCrowdRange(shape, event_in) {
        const shape_id = shape['@id'];
        $.ajax({
            // this.context.getPrefixedURI(IVIEWER) is not ready...?
            url : '/iviewer/fastmal_shape_annotation/' + shape_id + '/CrowdRange/' + event_in.target.value + '/',
            async : true,
            success : (response) => {
                try {
                    if ("error" in response) {
                        event_in.target.value = '???';
                    } else if ("msg" in response) {
                        console.log('CrowdRange saved');
                        event_in.target.style.backgroundColor = 'lightgreen';
                        setTimeout(function(){ event_in.target.style.backgroundColor='white'; }, 3000);
                    } else {
                        event_in.target.value = "???";
                    }
                } catch(err) {
                    console.error("Failed to get shape annotation ");
                    event_in.target.value="???";
                }
            }, error : (error) => {
                console.error("Failed to get shape annotation ")
                event_in.target.value="???";
            }
        });
    }

    /**
     * Gets crowd range annotation, if any, for a given shape
     */
    getCrowdRange(shape, element) {
        const shape_id = shape['@id'];
        $.ajax({
            // this.context.getPrefixedURI(IVIEWER) is not ready...?
            url : '/iviewer/fastmal_shape_annotation/' + shape_id + '/CrowdRange/',
            async : true,
            success : (response) => {
                try {
                    if ("error" in response && response["error"] == "Annotation not found") {
                        element.value = '';
                    } else if ("msg" in response && response["msg"] == "MapAnnotation found") {
                        element.value = response["annotation"][1];
                    } else {
                        element.value = "???";
                    }
                } catch(err) {
                    console.error("Failed to get shape annotation ");
                    element.value="???";
                }
            }, error : (error) => {
                console.error("Failed to get shape annotation ")
                element.value="???";
            }
        });
    }


    /**
     * Returns HTML required for links to previous and next image in dataset
     */
    getLinkToPrevNext(currentId) {
        const base_url = '/iviewer/?dataset=' + this.datasetRoiCounts['dataset_id'];
        const currentIndex = this.datasetRoiCounts['image_ids'].indexOf(currentId);

        // link to next image
        let next_url = '';
        let next_html = '';
        if (currentIndex < this.datasetRoiCounts['image_ids'].length - 1) {
            next_url = base_url + '&images=' + this.datasetRoiCounts['image_ids'][currentIndex + 1];
            next_html = '<a style="color:white;" href="' + next_url +'">next</a>';
        }

        // link to previous image
        let prev_url = '';
        let prev_html = '';
        if (currentIndex > 0) {
            prev_url = base_url + '&images=' + this.datasetRoiCounts['image_ids'][currentIndex - 1];
            prev_html = '<a style="color:white;" href="' + prev_url +'">previous</a>';
        }

        // put the two urls together
        let delim = '';
        if (next_url.length > 0 && prev_url.length > 0) {
            delim = ', ';
        }
        return '( ' + prev_html + delim + next_html + ' )';
    }

}
