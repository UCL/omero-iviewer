/**
 * FASt-Mal modifications to omero-iviewer code. This functions are peppered throughout the
 * omero-iviewer code
 */

import {noView} from 'aurelia-framework';
import {Converters} from '../utils/converters';

export const FASTMAL_DESELECTED = "FASTMAL_DESELECTED";
export const FASTMAL_SELECTED = "FASTMAL_SELECTED";
export const FASTMAL_COMMENT_UPDATE = "FASTMAL_COMMENT_UPDATE";


@noView
export class FastMal {
    // ROI types for thick film
    fastmal_selected_roi_type = 0;

    static xxx() {
    }

    static getRoiTypes() {
        return [
        { id: 0, name: 'Off', code: 'FASTMAL:ERROR_SELECTION_ROI!', description: 'No shape - only select', colour: "0,0,0"},
        { id: 1, name: 'White cell', code: 'FASTMAL:WHITE_CELL', description: '', colour: "102,194,165" },
        { id: 2, name: 'Parasite', code: 'FASTMAL:PARASITE', description: '', colour:  "252,141,98"},
        { id: 3, name: 'Background', code: 'FASTMAL:BACKGROUND', description: '', colour: "141,160,203"},
        { id: 4, name: 'Ignore', code: 'FASTMAL:IGNORE', description: '', colour: "231,138,195" },
        ];
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
        return [count["FASTMAL:WHITE_CELL"], count["FASTMAL:PARASITE"]];
    }

    static roiTypeSelected(event_in, regions_info, context, regions_edit_instance) {
        let type_id = event_in.target.model;
        let roi_types = FastMal.getRoiTypes();

        console.log('fastmalRoiClick() *; type_id = ' + type_id);

        if (type_id == 0) {
            regions_info.shape_defaults.Text = '';
            regions_info.shape_to_be_drawn = null;
            context.publish( "FASTMAL_DESELECTED", {});
        } else {
            regions_info.shape_to_be_drawn = 'rectangle';
        }


        let rgb_string = 'rgb(' + roi_types[type_id].colour + ')';
        regions_info.shape_defaults.StrokeColor = Converters.rgbaToSignedInteger(rgb_string);
        regions_edit_instance.setDrawColors(rgb_string, false);

        // let strokeOptions = this.getColorPickerOptions(false);
        // let strokeSpectrum = $(this.element).find(".shape-stroke-color .spectrum-input");
        // $(".shape-stroke-color").attr('title', '');
        // strokeSpectrum.spectrum("enable");
        // let strokeColor = this.regions_info.shape_defaults.StrokeColor;
        // strokeOptions.color = Converters.signedIntegerToRgba(strokeColor);
        // strokeSpectrum.spectrum(strokeOptions);

        if (type_id == 0) {
            // this.regions_info.shape_defaults.Text = '';
            // this.regions_info.shape_to_be_drawn = null;
            // this.context.publish( "FASTMAL_DESELECTED", {});
            return true;
        }

        console.log('fastmalRoiClick type_id = ' + type_id + '; colour = ' + rgb_string);
        // let editComment = $(this.element).find(".shape-edit-comment input");
        // editComment.prop("value", this.fastmal_roi_types[type_id].name);
        regions_info.shape_defaults.Text = roi_types[type_id].code;
        console.log('fastmalRoiClick type_id = ' + type_id + '; Text = ' + regions_info.shape_defaults.Text);

        context.publish( "FASTMAL_SELECTED", {shape_id: 0});
        return true;
    }

}

