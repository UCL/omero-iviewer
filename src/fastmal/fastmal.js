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
     * Holds the ROI information about a given dataset
     */
    datasetRoiCounts = null;

    static get THICK_FILM_ROI_TYPES() {
        return [
            { id: 0, name: 'Off', code: 'FASTMAL:ERROR_SELECTION_ROI!',
                description: 'No shape - only select', colour: "0,0,0"},
            { id: 1, name: 'White cell', code: 'FASTMAL:WHITE_CELL',
                description: '', colour: "102,194,165" },
            { id: 2, name: 'Parasite', code: 'FASTMAL:PARASITE',
                description: '', colour:  "252,141,98"},
            { id: 3, name: 'Background', code: 'FASTMAL:BACKGROUND',
                description: '', colour: "141,160,203"},
            { id: 4, name: 'Ignore', code: 'FASTMAL:IGNORE',
                description: '', colour: "231,138,195" },
        ];
    }

    /**
     * NOTE: these are made up
     */
    static get THIN_FILM_ROI_TYPES() {
        return [
            { id: 0, name: 'Off', code: 'FASTMAL:ERROR_SELECTION_ROI!',
                description: 'No shape - only select', colour: "0,0,0"},
            { id: 1, name: 'Interesting', code: 'FASTMAL:INTERESTING',
                description: '', colour: "102,194,165" },
            { id: 2, name: 'Not interesting', code: 'FASTMAL:NOT INTERESTING',
                description: '', colour:  "252,141,98"},
        ];
    }


    constructor(context) {
        this.context = context;
        this.fastmal_roi_types = this.getRoiTypes();
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
        // TODO: return either thick film or think film ROI types based on the dataset type
        return FastMal.THICK_FILM_ROI_TYPES;
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
        regions_info.shape_to_be_drawn = 'rectangle';

        let rgb_string = 'rgb(' + roi_types[type_id].colour + ')';
        regions_info.shape_defaults.StrokeColor = Converters.rgbaToSignedInteger(rgb_string);

        this.context.publish(FASTMAL_SELECTED, {shape_id: 0}); // fires regions-drawing.onDrawShape()
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

}
