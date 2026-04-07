import { LiteGraph } from "litegraph.js";
import { listOverlayTemplates } from "../lib/tauri";

const LOADING_PLACEHOLDER = "(loading…)";
const EMPTY_PLACEHOLDER = "(no templates)";

export function OverlayDisplayNode(this: any) {
  this.addInput("message", "string");
  this.addInput("duration (s)", "string");
  this.properties = { templateName: "" };

  this.addWidget(
    "combo",
    "Template",
    this.properties.templateName,
    (value: string) => {
      this.properties.templateName = value;
    },
    { values: [LOADING_PLACEHOLDER] }
  );

  this.size = [220, 120];
  this.serialize_widgets = true;
}

OverlayDisplayNode.prototype.onAdded = function (this: any) {
  const node = this;
  listOverlayTemplates()
    .then((names) => {
      const values = names.length > 0 ? names : [EMPTY_PLACEHOLDER];
      const widget = node.widgets?.find((w: any) => w.name === "Template");
      if (widget) {
        widget.options.values = values;
        if (
          !node.properties.templateName ||
          !values.includes(node.properties.templateName)
        ) {
          node.properties.templateName = names[0] ?? "";
          widget.value = names[0] ?? "";
        } else {
          widget.value = node.properties.templateName;
        }
        node.setDirtyCanvas(true);
      }
    })
    .catch(() => {
      const widget = node.widgets?.find((w: any) => w.name === "Template");
      if (widget) {
        widget.options.values = [EMPTY_PLACEHOLDER];
        node.setDirtyCanvas(true);
      }
    });
};

OverlayDisplayNode.title = "Overlay Display";
OverlayDisplayNode.desc = "Display an overlay on the stream";

export function register() {
  LiteGraph.registerNodeType("overlay/display", OverlayDisplayNode as any);
}
