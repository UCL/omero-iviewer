/**
 * FastMal modifications to omero-iviewer code.
 *
 * Usage is peppered throughout the omero-iviewer code
 */

import {Converters} from "../utils/converters";

// Constants for publish/subscribe events
export const FASTMAL_DESELECTED = "FASTMAL_DESELECTED";
export const FASTMAL_SELECTED = "FASTMAL_SELECTED";
export const FASTMAL_COMMENT_UPDATE = "FASTMAL_COMMENT_UPDATE";
export const FASTMAL_COUNT_UPDATE = "FASTMAL_COUNT_UPDATE";
export const FASTMAL_THUMBNAIL_REFRESH = "FASTMAL_THUMBNAIL_REFRESH";

export default class FastMal {

    /**
     * Reference to the global Context instance
     */
    context = null;

    /**
     * Whether the current image has the 'FASTMAL_ROI_COMPLETE' tag linked
     */
    roiAnnotationComplete = null;

    /**
     * The list of image ids which has some annotations but do not have the 'FASTMAL_ROI_COMPLETE' tag linked
     */
    imagesAnnotationInProgress = [];

    /**
     * A reference to the fastMalAnnotationsTree displaying annotation labels
     */
    annotationsTree = null;

    /**
     * A dictionary showing which secondary-labels have been added to a shape
     */
    shapeToLabels = { };

    /**
     * Stores the current active shape
     */
    lastActiveShape = 0; // rectangle

    /**
     * Holds the ROI information about a given dataset
     */
    datasetRoiInfo = null;

    /**
     * Information about the currently logged-in user
     */
    userInfo = null;

    /**
     * Holds the secondary labels currently selected before drawing ROI. After drawing, it's stored
     * in shapeToLabels
     */
    selectedLabelsForShape = new Set();

    /**
     * Linked CommentAnnotations for saved ROI labels on current image1
     */
    savedCommentAnnotations = { };

    /**
     * A lookup table for readable descriptions of labels
     */
    roiLabelDescriptionLookup = { };

    /**
     * A list of nice colours to use for ROIs
     */
    lineColours = [ "230,25,75", "60,180,75", "255,225,25", "0,130,200", 
        "245,130,48", "145,30,180", "70,240,240", "240,50,230", 
        "210,245,60", "250,190,190", "0,128,128", "230,190,255", 
        "170,110,40", "255,250,200", "128,0,0", "170,255,195", 
        "128,128,0", "255,215,180", "0,0,128", "128,128,128" ];

    /**
     * The default 'Off' state ROI label
     */
    static get NO_ROI_LABELS_DEFINED() {
        return [
            { name: "Off", id: "FASTMAL:OFF" }
        ];
    }

    constructor(context) {
        this.context = context;
        this.setUserInfo();
        console.log("Instantiated FastMal", this);  // Useful for debugging in devtools
    }

    onImageConfigChange() {
        if (this.context.getSelectedImageConfig() === null) return;
        let image_info = this.context.getSelectedImageConfig().image_info;
        this.loadImageRoiComments();
    }

    loadImageRoiComments() {
        let image_info = this.context.getSelectedImageConfig().image_info;
        const image_id = image_info.image_id;
        $.ajax({
            url : `/iviewer/fastmal_image_roi_comments/${image_id}/`,
            async : true,
            success : (response) => {
                this.savedCommentAnnotations = response;
            }, error : (error) => {
                console.error("Failed to get linked CommentAnnotations for image", error);
            }
        });
    }

    /**
     * Requests the logged in user's information and stores it locally
     * (used to filter ROIs by user)
     */
    setUserInfo() {
        $.ajax({
            url : "/iviewer/fastmal_user/",
            type: "GET",
            dataType: "json",
            async : true,
            success : (response) => {
                try {
                    this.userInfo = response;
                } catch(err) {
                    console.error("Failed to userInfo", err);
                    this.userInfo = err["responseJSON"];
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
     * Save the secondary labels for a given shape
     * The shape_id is the "old id" used whilst drawing
     */
    saveShapeLabel(shape_id) {
        const label_set = this.selectedLabelsForShape;
        console.log("FastMal.saveShapeLabel", [shape_id, label_set]);

        if (shape_id in this.shapeToLabels) {
            console.error(`shape_id ${shape_id} already exists in shapeToLabels`);
            console.log(this.shapeToLabels);
        } else {
            if (label_set.size > 0) {
                console.log(`saved shaped label for ${shape_id}`, label_set);
                this.shapeToLabels[shape_id] = new Set(label_set);
            }
        }
    }

    /**
     * Returns the ROI types valid for the currently loaded dataset
     */
    getRoiLabels() {
        return this.datasetRoiInfo["project_roi_labels"];
    }

    /**
     * Iterates over all ROIs in regions_info and tallies the ROI Type
     */
    countRoiLabels(regions_info) {
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
    getRoiLabelCountsHTML(regions_info) {
        // Is the currently select image linked to the FASTMAL_ROI_COMPLETE tag
        this.roiAnnotationComplete = this.context.getSelectedImageConfig().image_info.image_id.toString() in this.datasetRoiInfo["images_roi_complete"];

        const counts = this.countRoiLabels(regions_info);
        const roiLabels = this.getRoiLabels();
        let html = "";
        // total = ROI type counts for image; grandTotal = ROI type counts for dataset
        let total = 0, grandTotal = 0, iCount = 0;
        const datasetCounts = this.datasetRoiInfo["roi_type_count"];
        const imageCounts = this.datasetRoiInfo["images_per_roi"];
        for (let i = 1; i < roiLabels.length; i++) {
            total = counts[roiLabels[i].id] ? counts[roiLabels[i].id] : 0;
            grandTotal = datasetCounts[roiLabels[i].id] ? datasetCounts[roiLabels[i].id] : 0;
            iCount = imageCounts[roiLabels[i].id] ? imageCounts[roiLabels[i].id] : 0;
            html += `${roiLabels[i].name}: ${total}/${grandTotal} from ${iCount}; `;
        }
        return html;
    }

    /**
     * Return an array counting counts of each ROI type for a given image ID
     * Used in thumbnail slider view
     */
    getRoiLabelCountsForImage(image_id) {
        const roiLabels = this.getRoiLabels();
        let counts;
        if (image_id in this.datasetRoiInfo["images_with_rois"]) {
            counts = [];
            const lookup = this.datasetRoiInfo["images_with_rois"][image_id.toString()];
            for (let i = 1; i < roiLabels.length; i++) {
                counts.push(lookup[roiLabels[i].id] ? lookup[roiLabels[i].id] : 0);
            }
        } else {
            counts = Array(roiLabels.length).fill(0);
        }
        return counts;
    }

    /**
     * Update FASTMAL:ROI_COMPLETE tag for this image
     */
    updateRoiCompleteTag(state) {
        $.ajax({
            url : `/iviewer/fastmal_roi_complete_tag/${this.getRegionsInfo().image_info.image_id}/${state}/`,
            success : (response) => {
                try {
                    console.log("Successfully set tag", response);
                    this.refreshDatasetRoiInfo(null);
                    return true;
                } catch(err) {
                    console.error("Failed to set tag");
                    return false;
                }
            }, error : (error) => {
                console.error("Failed to set tag", error);
                return false;
            }
        });
    }

    /**
     * Get active regions_info via the Context
     */
    getRegionsInfo() {
        return this.context.getSelectedImageConfig().regions_info;
    }

    /**
     * Return the appropriate indicator to display next to thumbnail
     * for complete/in progress/no ROI annotations
     */
    getCompletedRoiIndicator(image_id) {
        if (image_id.toString() in this.datasetRoiInfo["images_roi_complete"]) {
            return "✔";
        } else if (image_id.toString() in this.datasetRoiInfo["images_with_rois"]) {
            return "✘";
        }
        return "";
    }

    /**
     * Triggered by regions-edit.js when user clicks on 'Select ROI' list
     * Set regions drawing default for a given type
     */
    annotationsTreeClick(node_id) {
        const node_level = this.annotationsTree.tree("getNodeById", node_id).getLevel();

        if (node_level === 1) {
            return this.primaryLabelClicked(node_id);
        } else if (node_level === 2) {
            return this.secondaryLabelClicked(node_id);
        } else {
            console.error(`Do not know how to handle level ${node_level} node`);
            return false;
        }
    }

    /**
     * handles selection of top-level roi label
     */
    primaryLabelClicked(node_id) {
        const regions_info = this.getRegionsInfo();

        // just an alias
        const t = this.annotationsTree;

        // deselect all nodes
        t.tree("getState").selected_node.forEach((node_id) => {
            const node = t.tree("getNodeById", node_id);
            t.tree("removeFromSelection", node);
        });

        // close all open nodes
        t.tree("getState").open_nodes.forEach((node_id) => {
            const node = t.tree("getNodeById", node_id);
            t.tree("closeNode", node);
        });

        // select ond open the selected node only
        const node = t.tree("getNodeById", node_id);
        t.tree("selectNode", node, { mustToggle: false });
        t.tree("openNode", node);

        // always clear all saved secondary labels
        this.selectedLabelsForShape.clear();

        // If we're turning off ROI shapes (i.e. select mode)
        if (node_id === "FASTMAL:OFF") {
            regions_info.shape_defaults.Text = "";
            regions_info.shape_to_be_drawn = null;
            this.context.publish(FASTMAL_DESELECTED, {}); // fires regions-drawing.onDrawShape()
            return true;
        }

        regions_info.shape_defaults.Text = node_id;
        const selected_node = t.tree("getNodeById", node_id);
        const rgb_string = `rgb(${selected_node.colour})`;
        regions_info.shape_defaults.StrokeColor = Converters.rgbaToSignedInteger(rgb_string);

        this.context.publish(FASTMAL_SELECTED, {shape_id: this.lastActiveShape}); // fires regions-drawing.onDrawShape()
        return true;
    }

    /**
     * handles selection of sub-level roi label
     */
    secondaryLabelClicked(node_id) {
        const regions_info = this.getRegionsInfo();

        // get the node that user wants to select (target node)
        const target_node = this.annotationsTree.tree("getNodeById", node_id);
        const target_parent_node = target_node.parent;

        // if the target node is currently selected
        if (this.annotationsTree.tree("isNodeSelected", target_node)) {
            // turn off selection
            this.annotationsTree.tree("removeFromSelection", target_node);
            this.selectedLabelsForShape.delete(node_id);
            this.context.publish(FASTMAL_SELECTED, {shape_id: this.lastActiveShape}); // fires regions-drawing.onDrawShape()
            return true;
        }
        
        // if the parent node is currently the selected node
        if (this.annotationsTree.tree("isNodeSelected", target_parent_node)) {
            // allow use to select (on/off) the target node
            this.annotationsTree.tree("addToSelection", target_node);
            this.selectedLabelsForShape.add(node_id);
            this.context.publish(FASTMAL_SELECTED, {shape_id: this.lastActiveShape}); // fires regions-drawing.onDrawShape()
            return true;
        } else {
            // prevent user from selecting this node
            return false;
        }
    }

    /**
     * Retrieves ROI and tag information about a dataset and stores it
     * in instance variable
     */
    refreshDatasetRoiInfo(dataset_id, async=true) {
        // If dataset id not given, use the current dataset
        if (dataset_id == null) {
            dataset_id = this.datasetRoiInfo["dataset_id"];
        }

        $.ajax({
            // this.context.getPrefixedURI(IVIEWER) is not ready...?
            url : `/iviewer/fastmal_data/${dataset_id}/`,
            async : async,
            dataType: "json",
            success : (response) => {
                try {
                    this.datasetRoiInfo = response;
                    this.datasetRoiInfo["dataset_id"] = dataset_id;
                    this.setInProgressImageIds();

                    // add "off" to the project roi labels (at the beginning of the list)
                    this.datasetRoiInfo.project_roi_labels.unshift(
                        { "name": "Off", "id": "FASTMAL:OFF" }
                    );

                    // give each top-level roi label an id and a colour
                    for (let i = 1; i < this.datasetRoiInfo.project_roi_labels.length; i++) {
                        this.datasetRoiInfo.project_roi_labels[i]["colour"] = this.lineColours[i];
                    }

                    // keep a lookup table for node descriptions
                    // note we only handle two levels deep here!
                    this.roiLabelDescriptionLookup = Object.values(this.datasetRoiInfo.project_roi_labels).reduce((acc, node) => {
                            acc[node.id] = node.name;
                            if ('children' in node) {
                                node.children.forEach((c) => { acc[c.id] = c.name })
                            }
                            return acc;
                        }, { } );

                    this.context.publish(FASTMAL_COUNT_UPDATE, {}); // fires regions-list.updateRoiCounts()
                    this.context.publish(FASTMAL_THUMBNAIL_REFRESH, {});
                } catch(err) {
                    console.error("Failed to load Rois", err.responseJSON);
                    this.datasetRoiInfo = err.responseJSON;
                }
            }, error : (error) => {
                console.error("Failed to load Rois", error.responseJSON);
                this.datasetRoiInfo = error.responseJSON;
            }
        });
    }

    /**
     * Constructs HTML links to display at top of thumbnail slide
     */
    setInProgressImageIds() {
        // for each image that has annotations, add it to the 'in progress' array if it is not
        // linked to the FASTMAL_ROI_COMPLETE tag
        this.imagesAnnotationInProgress = Object.keys(this.datasetRoiInfo["images_with_rois"]).reduce((acc, image_id) => {
            if (!(image_id in this.datasetRoiInfo["images_roi_complete"]))
                acc.push(image_id);
            return acc;
        }, [])
    }

    /**
     * Handles the updating of the range in CROWD roi annotation
     */
    updateCrowdRange(shape, event_in) {
        const shape_id = shape["@id"];
        $.ajax({
            // this.context.getPrefixedURI(IVIEWER) is not ready...?
            url : `/iviewer/fastmal_shape_annotation/${shape_id}/CrowdRange/${event_in.target.value}/`,
            async : true,
            success : (response) => {
                try {
                    if ("error" in response) {
                        event_in.target.value = "???";
                    } else if ("msg" in response) {
                        console.log("CrowdRange saved");
                        event_in.target.style.backgroundColor = "lightgreen";
                        setTimeout(function(){ event_in.target.style.backgroundColor="white"; }, 3000);
                    } else {
                        event_in.target.value = "???";
                    }
                } catch(err) {
                    console.error("Failed to get shape annotation ");
                    event_in.target.value="???";
                }
            }, error : (error) => {
                console.error("Failed to get shape annotation", error);
                event_in.target.value="???";
            }
        });
    }

    /**
     * Gets crowd range annotation, if any, for a given shape
     */
    getCrowdRange(shape, element) {
        const shape_id = shape["@id"];
        $.ajax({
            // this.context.getPrefixedURI(IVIEWER) is not ready...?
            url : `/iviewer/fastmal_shape_annotation/${shape_id}/CrowdRange/`,
            async : true,
            success : (response) => {
                try {
                    if ("error" in response && response["error"] === "Annotation not found") {
                        element.value = "";
                    } else if ("msg" in response && response["msg"] === "MapAnnotation found") {
                        element.value = response["annotation"][1];
                    } else {
                        element.value = "???";
                    }
                } catch(err) {
                    console.error("Failed to get shape annotation", err);
                    element.value="???";
                }
            }, error : (error) => {
                console.error("Failed to get shape annotation", error);
                element.value="???";
            }
        });
    }

    /**
     * Returns HTML required for links to previous and next image in dataset
     */
    getLinkToPrevNext(currentId) {
        const base_url = `/iviewer/?dataset=${this.datasetRoiInfo["dataset_id"]}`;
        const currentIndex = this.datasetRoiInfo["image_ids"].indexOf(currentId);

        // link to next image
        let next_url = "";
        let next_html = "";
        if (currentIndex < this.datasetRoiInfo["image_ids"].length - 1) {
            next_url = base_url + "&images=" + this.datasetRoiInfo["image_ids"][currentIndex + 1];
            next_html = `<a style="color:white;" href="${next_url}">next</a>`;
        }

        // link to previous image
        let prev_url = "";
        let prev_html = "";
        if (currentIndex > 0) {
            prev_url = base_url + "&images=" + this.datasetRoiInfo["image_ids"][currentIndex - 1];
            prev_html = `<a style="color:white;" href="${prev_url}">previous</a>`;
        }

        // put the two urls together
        let delim = "";
        if (next_url.length > 0 && prev_url.length > 0) {
            delim = ", ";
        }
        return `( ${prev_html}${delim}${next_html} )`
    }

    /**
     * Takes a list of new id (from OMERO) to old id (in omero-viewer) when ROIs
     * have been created on the OMERO server. Creates the roi-annotation links for 
     * secondary labels (if any)
     */
    linkRoiComment(rois) {
        let toSend = [];
        // for each newId-oldId pair in the list
        for (let i = 0; i < rois.length; i++) {
            let pair = rois[i];
            let newId = pair[0];
            let oldId = pair[1];
            // check if we have any shape labels saved under the oldId
            if (oldId in this.shapeToLabels) {
                // collect all the labels together and add to the list
                // to send to the OMERO server
                let labels = Array.from(this.shapeToLabels[oldId]);
                if (labels.length > 0) {
                    labels = labels.join();
                    toSend.push([newId, labels]);
                }
            }
        }

        // if we found any rois with labels to update on the server
        if (toSend.length > 0) {
            $.ajax({
                url : "/iviewer/fastmal_roi_comment/",
                type : "POST",
                contentType : "application/json",
                data: JSON.stringify(toSend),
                dataType: "json",
                async : true,
                success : (response) => {
                    try {
                        console.log("Success", response);
                        // reload the roi comment lookup table
                        this.loadImageRoiComments();
                    } catch(error) {
                        console.error("Error linking roi to comments", error);
                    }
                }, 
                error : (error) => {
                    console.error("Error linking roi to comments", error)
                }
            });
        } else {
            console.log("Nothing to send");
        }
    }

    /**
     * Given a first-level ROI label or a shape, this function returns the human-readable
     * description
     */
    getPrettyRoiLabels(params) {
        // if the normal text label was given
        if ('text' in params) {
            return `${this.roiLabelDescriptionLookup[params.text]}`
        }

        // otherwise, we have the shape
        const shape = params.shape;

        let roi_id;
        let output = [ ];

        // first check whether it's in the saved ROI lookup table
        // if the shape has been saved and image config loaded, we'll have the image annotations
        // saved in savedCommentAnnotations
        if (shape['@id'] in this.savedCommentAnnotations) {
            roi_id = shape['@id'];
            this.savedCommentAnnotations[roi_id].forEach((id) => {
                if (id in this.roiLabelDescriptionLookup) {
                    output.push(this.roiLabelDescriptionLookup[id]);
                } else {
                    output.push(id);
                }
            });
        // otherwise, use the old shape_id and look in the shapeToLabels, which stores the current
        // user options about which secondary-level labels are set for shapes
        } else if (shape.oldId in this.shapeToLabels) {
            roi_id = shape.oldId;
            this.shapeToLabels[roi_id].forEach((id) => {
                if (id in this.roiLabelDescriptionLookup) {
                    output.push(this.roiLabelDescriptionLookup[id]);
                } else {
                    output.push(id);
                }
            });
        }

        if (output.length > 0) {
            return `(${output.join()})`;
        }

        return "";
    }
}
