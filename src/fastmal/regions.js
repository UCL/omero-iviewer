/**
 * FASt-Mal modifications to omero-iviewer code. 
 *
 * Usage of these methods are peppered throughout the omero-iviewer code
 */

import {inject, noView} from 'aurelia-framework';
import {Converters} from '../utils/converters';
// import Context from '../app/context';

// Constants for publish/subscribe events
export const FASTMAL_DESELECTED = "FASTMAL_DESELECTED";
export const FASTMAL_SELECTED = "FASTMAL_SELECTED";
export const FASTMAL_COMMENT_UPDATE = "FASTMAL_COMMENT_UPDATE";

@noView
// @inject(Context)
export class FastMal {
    // constructor(context) {
    //     super(context.eventbus);
    //     this.context = context;
    // }

    static get THICK_FILM_ROI_TYPES() {
        return [
            { id: 0, name: 'Off', code: 'FASTMAL:ERROR_SELECTION_ROI!', description: 'No shape - only select', colour: "0,0,0"},
            { id: 1, name: 'White cell', code: 'FASTMAL:WHITE_CELL', description: '', colour: "102,194,165" },
            { id: 2, name: 'Parasite', code: 'FASTMAL:PARASITE', description: '', colour:  "252,141,98"},
            { id: 3, name: 'Background', code: 'FASTMAL:BACKGROUND', description: '', colour: "141,160,203"},
            { id: 4, name: 'Ignore', code: 'FASTMAL:IGNORE', description: '', colour: "231,138,195" },
        ];
    }

    static getRoiTypes() {
        // TODO: return either thick film or think film ROI types based on the dataset type
        return FastMal.THICK_FILM_ROI_TYPES;
    }

    static getRoiTypeCounts(roi_info) {
        let data = roi_info.data;
        var count = {};
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

    static getRoiTypeCountsHTML(roi_info) {
        let counts = FastMal.getRoiTypeCounts(roi_info);
        let roi_types = FastMal.getRoiTypes();
        var html = "";
        var total;
        for (var i = 1; i < roi_types.length; i++) {
            total = counts[roi_types[i].code] ? counts[roi_types[i].code] : 0;
            html += roi_types[i].name + " = " + total + "; ";
        }
        return html;
    }

    static roiTypeSelected(event_in, regions_info, context, regions_edit_instance) {
        let type_id = event_in.target.model;
        let roi_types = FastMal.getRoiTypes();

        // If we're turning off ROI shapes (i.e. select mode)
        if (type_id == 0) {
            regions_info.shape_defaults.Text = '';
            regions_info.shape_to_be_drawn = null;
            context.publish(FASTMAL_DESELECTED, {});
            return true;
        }

        regions_info.shape_defaults.Text = roi_types[type_id].code;
        regions_info.shape_to_be_drawn = 'rectangle';

        let rgb_string = 'rgb(' + roi_types[type_id].colour + ')';
        regions_info.shape_defaults.StrokeColor = Converters.rgbaToSignedInteger(rgb_string);
        regions_edit_instance.setDrawColors(rgb_string, false);

        context.publish(FASTMAL_SELECTED, {shape_id: 0});
        return true;
    }
}

