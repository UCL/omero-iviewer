/**
 * FASt-Mal modifications to omero-iviewer code.
 *
 * Usage of these methods are peppered throughout the omero-iviewer code
 */

import {Converters} from '../utils/converters';

// Constants for publish/subscribe events
export const FASTMAL_DESELECTED = "FASTMAL_DESELECTED";
export const FASTMAL_SELECTED = "FASTMAL_SELECTED";
export const FASTMAL_COMMENT_UPDATE = "FASTMAL_COMMENT_UPDATE";

export default class FastMal {

    context = null;

    constructor(context) {
        console.log('Instantiated FastMal');
        this.context = context;
    }

    static get THICK_FILM_ROI_TYPES() {
        return [
            { id: 0, name: 'Off', code: 'FASTMAL:ERROR_SELECTION_ROI!', description: 'No shape - only select', colour: "0,0,0"},
            { id: 1, name: 'White cell', code: 'FASTMAL:WHITE_CELL', description: '', colour: "102,194,165" },
            { id: 2, name: 'Parasite', code: 'FASTMAL:PARASITE', description: '', colour:  "252,141,98"},
            { id: 3, name: 'Background', code: 'FASTMAL:BACKGROUND', description: '', colour: "141,160,203"},
            { id: 4, name: 'Ignore', code: 'FASTMAL:IGNORE', description: '', colour: "231,138,195" },
        ];
    }

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
        let counts = this.getRoiTypeCounts(regions_info);
        let roi_types = this.getRoiTypes();
        let html = "";
        let total;
        for (let i = 1; i < roi_types.length; i++) {
            total = counts[roi_types[i].code] ? counts[roi_types[i].code] : 0;
            html += roi_types[i].name + " = " + total + "; ";
        }
        return html;
    }

    /**
     * Get active regions_info via the Context (testing...)
     */
    getRegionsInfo() {
        let image_config = this.context.getSelectedImageConfig();
        return image_config.regions_info;
    }

    /**
     * Triggered by regions-edit.js when user clicks on 'Select ROI' list
     */
    roiTypeSelected(event_in, regions_edit_instance) {
        let regions_info = this.getRegionsInfo()
        let type_id = event_in.target.model;
        let roi_types = this.getRoiTypes();

        // If we're turning off ROI shapes (i.e. select mode)
        if (type_id == 0) {
            regions_info.shape_defaults.Text = '';
            regions_info.shape_to_be_drawn = null;
            this.context.publish(FASTMAL_DESELECTED, {});
            return true;
        }

        regions_info.shape_defaults.Text = roi_types[type_id].code;
        regions_info.shape_to_be_drawn = 'rectangle';

        let rgb_string = 'rgb(' + roi_types[type_id].colour + ')';
        regions_info.shape_defaults.StrokeColor = Converters.rgbaToSignedInteger(rgb_string);
        regions_edit_instance.setDrawColors(rgb_string, false);

        this.context.publish(FASTMAL_SELECTED, {shape_id: 0});
        return true;
    }

    datasetRoiCounts = null;

    getDatasetRoiCounts(dataset_id, server) {
        $.ajax({
            url : '/iviewer/fastmal_data/' + dataset_id + '/',
            success : (response) => {
                try {
                    this.datasetRoiCounts = response;
                } catch(err) {
                    console.error("Failed to load Rois: " + err);
                }
            }, error : (error) => {
                console.error("Failed to load Rois: " + error)
            }
        });
    }
}

