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
    fastmal_selected_roi_type = 0;
    fastmal_roi_types = null;
    fastmal_selected_roi_complete = null;
    fastmal_inprogress_images = [];

    /**
     * Stores the current active shape
     */
    fastmal_last_active_shape = 0; // rectangle

    /**
     * Holds the ROI information about a given dataset
     */
    datasetRoiCounts = null;

    static get THICK_FILM_ROI_TYPES() {
        return [
            { id: 0, name: 'Off', code: 'FASTMAL:ERROR_SELECTION_ROI!',
                description: 'No shape - only select', colour: "0,0,0"},
            { id: 1, name: 'White cell', code: 'FASTMAL:WHITE_CELL',
                description: '', colour: "102,194,165" },
            { id: 2, name: 'White cell (CROWD)', code: 'FASTMAL:WHITE_CELL_CROWD',
                description: '', colour: "102,194,164" },
            { id: 3, name: 'Parasite', code: 'FASTMAL:PARASITE',
                description: '', colour:  "252,141,98"},
            { id: 4, name: 'Parasite (CROWD)', code: 'FASTMAL:PARASITE_CROWD',
                description: '', colour:  "252,141,98"},
            { id: 5, name: 'Background', code: 'FASTMAL:BACKGROUND',
                description: '', colour: "141,160,203"},
            { id: 6, name: 'Ignore', code: 'FASTMAL:IGNORE',
                description: '', colour: "231,138,195" },
        ];
    }

    static get THIN_FILM_ROI_TYPES() {
        return [
            { id: 0, name: 'Off', code: 'FASTMAL:ERROR_SELECTION_ROI!',
                description: 'No shape - only select', colour: "0,0,0"},
            { id: 1, name: 'White cell', code: 'FASTMAL:WHITE_CELL',
                description: '', colour: "102,194,165" },
            { id: 2, name: 'White cell (CROWD)', code: 'FASTMAL:WHITE_CELL_CROWD',
                description: '', colour: "102,194,164" },
            { id: 3, name: 'Red blood cell', code: 'FASTMAL:RED_CELL',
                description: '', colour:  "252,141,98"},
            { id: 4, name: 'Read blood cell (CROWD)', code: 'FASTMAL:RED_CELL_CROWD',
                description: '', colour:  "252,141,98"},
            { id: 5, name: 'Infected red blood cell', code: 'FASTMAL:INFECTED_RED_CELL',
                description: '', colour:  "252,141,98"},
            { id: 6, name: 'Background', code: 'FASTMAL:BACKGROUND',
                description: '', colour: "141,160,203"},
            { id: 7, name: 'Ignore', code: 'FASTMAL:IGNORE',
                description: '', colour: "231,138,195" },
        ];
    }


    constructor(context) {
        this.context = context;
        // by default, use thick film types
        this.fastmal_roi_types = FastMal.THICK_FILM_ROI_TYPES;
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
            async : true,
            success : (response) => {
                try {
                    this.userInfo = response;
                } catch(err) {
                    console.error("Failed to userInfo");
                    this.userInfo = err.responseJSON;
                }
            }, error : (error) => {
                console.error("Failed to load userInfo")
                this.userInfo = error.responseJSON;
            }
        });
    }


    /**
     * Returns the ROI types valid for this type of image
     */
    getRoiTypes() {
        if (this.context.getSelectedImageConfig() === null) {
            return FastMal.THICK_FILM_ROI_TYPES;
        }
        let image_info = this.context.getSelectedImageConfig().image_info;
        let dataset_name = image_info.dataset_name;

        // dataset names follow the format <FASTMAL_ID>-<F|S>-<A|B>-<PROJECT_ID>-<Timestamp>
        // the second to last item is the project suffix
        let dataset_parts = dataset_name.split("-");
        let project_suffix = dataset_parts[dataset_parts.length - 2];

        // get the first character of project suffix: 'F' or 'S'
        let suffix_parts = project_suffix.split("");
        if (suffix_parts[0] === "S") {
            return FastMal.THIN_FILM_ROI_TYPES;
        } else {  // return thick film if "F" (or otherwise)
            return FastMal.THICK_FILM_ROI_TYPES;
        }
    }

    /**
     * Iterates over all ROIs in regions_info and tallies the ROI Type
     */
    getRoiTypeCounts(regions_info) {
        let data = regions_info.data;
        let count = {};
        data.forEach(
            (value) =>
                value.shapes.forEach(
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
        let counts = this.getRoiTypeCounts(regions_info);
        this.fastmal_roi_types = this.getRoiTypes();
        let roi_types = this.getRoiTypes();
        let html = "";
        // total = ROI type counts for image; grandTotal = ROI type counts for dataset
        let total, grandTotal, iCount;
        let datasetCounts = this.datasetRoiCounts['roi_type_count'];
        let imageCounts = this.datasetRoiCounts['images_per_roi'];
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
        let roi_types = this.getRoiTypes();
        this.fastmal_roi_types = this.getRoiTypes();
        let counts = [];
        if (image_id in this.datasetRoiCounts["images_with_rois"]) {
            let lookup = this.datasetRoiCounts["images_with_rois"][image_id.toString()];
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
            url : this.context.server +
                '/iviewer/fastmal_roi_complete_tag/' + this.getRegionsInfo().image_info.image_id + '/' + state + '/',
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
        let image_config = this.context.getSelectedImageConfig();
        return image_config.regions_info;
    }

    /**
     * Triggered by regions-edit.js when user clicks on 'Select ROI' list
     */
    fastmalRoiClick(event_in) {
        return this.roiTypeSelected(event_in.target.model);
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
        let regions_info = this.getRegionsInfo()
        let roi_types = this.getRoiTypes();

        // If we're turning off ROI shapes (i.e. select mode)
        if (type_id == 0) {
            regions_info.shape_defaults.Text = '';
            regions_info.shape_to_be_drawn = null;
            this.context.publish(FASTMAL_DESELECTED, {}); // fires regions-drawing.onDrawShape()
            return true;
        }

        regions_info.shape_defaults.Text = roi_types[type_id].code;

        let rgb_string = 'rgb(' + roi_types[type_id].colour + ')';
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
            url : this.context.server +
                '/iviewer/fastmal_data/' + dataset_id + '/',
            async : async, // appara
            success : (response) => {
                try {
                    this.datasetRoiCounts = response;
                    this.datasetRoiCounts['dataset_id'] = dataset_id;
                    this.setInProgressImageIds();
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
        var image_ids = [];
        for (var image_id in this.datasetRoiCounts['images_with_rois']) {
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
        let shape_id = shape['@id'];
        $.ajax({
            // this.context.getPrefixedURI(IVIEWER) is not ready...?
            url : this.context.server +
                '/iviewer/fastmal_shape_annotation/' + shape_id + '/CrowdRange/' + event_in.target.value + '/',
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
        let shape_id = shape['@id'];
        let return_msg = "";
        $.ajax({
            // this.context.getPrefixedURI(IVIEWER) is not ready...?
            url : this.context.server +
                '/iviewer/fastmal_shape_annotation/' + shape_id + '/CrowdRange/',
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
        let base_url = this.context.server + '/iviewer/?dataset=' + this.datasetRoiCounts['dataset_id'];
        let currentIndex = this.datasetRoiCounts['image_ids'].indexOf(currentId);

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
