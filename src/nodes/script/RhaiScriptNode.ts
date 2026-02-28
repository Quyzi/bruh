import { LiteGraph } from "litegraph.js";
import { listScripts, executeScript } from "../../lib/tauri";

const LOADING_PLACEHOLDER = "(loading…)";
const EMPTY_PLACEHOLDER = "(no scripts)";

const OUTPUT_COUNT = 5;

export function RhaiScriptNode(this: any) {
  this.addInput("input 1", "string");
  this.addInput("input 2", "string");
  this.addInput("input 3", "string");
  this.addInput("input 4", "string");
  this.addInput("input 5", "string");
  for (let i = 1; i <= OUTPUT_COUNT; i++) {
    this.addOutput(`output ${i}`, "string");
  }
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

  this.size = [220, 140];
  this.serialize_widgets = true;
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
        } else {
          scriptWidget.value = node.properties.scriptName;
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

function setOutputsFromResult(node: any, result: unknown, fallback: unknown) {
  const values: unknown[] = [];
  if (Array.isArray(result)) {
    for (let i = 0; i < OUTPUT_COUNT; i++) {
      values.push(result[i] ?? null);
    }
  } else if (result !== null && typeof result === "object" && !Array.isArray(result)) {
    const obj = result as Record<string, unknown>;
    for (let i = 1; i <= OUTPUT_COUNT; i++) {
      values.push(obj[`output${i}`] ?? null);
    }
  } else {
    values.push(result);
    for (let i = 1; i < OUTPUT_COUNT; i++) {
      values.push(null);
    }
  }
  for (let i = 0; i < OUTPUT_COUNT; i++) {
    node.setOutputData(i + 1, values[i]);
  }
  for (let i = 0; i < OUTPUT_COUNT; i++) {
    node.triggerSlot(i);
  }
}

RhaiScriptNode.prototype.onAction = async function (this: any) {
  const inputData = this.getInputData(1);
  const scriptName = this.properties.scriptName;
  if (!scriptName || scriptName === LOADING_PLACEHOLDER || scriptName === EMPTY_PLACEHOLDER) {
    console.warn("Rhai Script node: no script selected");
    setOutputsFromResult(this, inputData, inputData);
    return;
  }
  try {
    const result = await executeScript(scriptName, inputData ?? null);
    setOutputsFromResult(this, result, inputData);
  } catch (error) {
    console.error("Rhai Script node error:", error);
    setOutputsFromResult(this, inputData, inputData);
  }
};

RhaiScriptNode.title = "Rhai Script";
RhaiScriptNode.desc = "Execute a Rhai script from the scripts directory";

export function register() {
  LiteGraph.registerNodeType("script/rhai", RhaiScriptNode as any);
}
