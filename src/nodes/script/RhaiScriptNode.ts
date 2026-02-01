import { LiteGraph } from "litegraph.js";
import { listScripts } from "../../lib/tauri";

const LOADING_PLACEHOLDER = "(loading…)";
const EMPTY_PLACEHOLDER = "(no scripts)";

export function RhaiScriptNode(this: any) {
  this.addInput("input", LiteGraph.ACTION);
  this.addOutput("output", LiteGraph.EVENT);
  this.properties = { scriptName: "" };

  // Combo needs at least one value; we replace with real list in onAddedToGraph
  this.addWidget(
    "combo",
    "Script",
    this.properties.scriptName,
    (value: string) => {
      this.properties.scriptName = value;
    },
    { values: [LOADING_PLACEHOLDER] }
  );

  this.size = [220, 80];
}

RhaiScriptNode.prototype.onAdded = function (this: any) {
  const node = this;
  listScripts()
    .then((names) => {
      const values = names.length > 0 ? names : [EMPTY_PLACEHOLDER];
      const scriptWidget = node.widgets?.find(
        (w: any) => w.name === "Script" && w.options?.values
      );
      if (scriptWidget) {
        scriptWidget.options.values = values;
        if (
          !node.properties.scriptName ||
          !values.includes(node.properties.scriptName)
        ) {
          const initial = names.length > 0 ? names[0] : "";
          node.properties.scriptName = initial;
          scriptWidget.value = initial;
        }
        node.setDirtyCanvas(true);
      }
    })
    .catch((_e) => {
      const scriptWidget = node.widgets?.find(
        (w: any) => w.name === "Script" && w.options?.values
      );
      if (scriptWidget) {
        scriptWidget.options.values = [EMPTY_PLACEHOLDER];
        node.properties.scriptName = "";
        scriptWidget.value = "";
        node.setDirtyCanvas(true);
      }
    });
};

RhaiScriptNode.prototype.onAction = function (this: any) {
  const input = this.getInputData(1);
  const scriptName = this.properties.scriptName;
  if (!scriptName || scriptName === LOADING_PLACEHOLDER || scriptName === EMPTY_PLACEHOLDER) {
    console.warn("Rhai Script node: no script selected");
    this.setOutputData(1, input);
    this.triggerSlot(0);
    return;
  }
  console.log("Run Rhai script:", scriptName, "with input:", input);
  // TODO: Invoke Tauri command to read script and execute Rhai
  this.setOutputData(1, input);
  this.triggerSlot(0);
};

RhaiScriptNode.title = "Rhai Script";
RhaiScriptNode.desc = "Execute a Rhai script from the scripts directory";

export function register() {
  LiteGraph.registerNodeType("script/rhai", RhaiScriptNode as any);
}
