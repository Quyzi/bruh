import { LiteGraph } from "litegraph.js";

export function RhaiScriptNode(this: any) {
  this.addInput("trigger", LiteGraph.ACTION);
  this.addInput("input", "any");
  this.addOutput("done", LiteGraph.EVENT);
  this.addOutput("result", "any");
  this.properties = { script: "// Rhai script\nlet result = input;\nresult" };
  this.size = [280, 120];
}

RhaiScriptNode.prototype.onAction = function(this: any) {
  const input = this.getInputData(1);
  console.log("Run Rhai script with input:", input);
  // TODO: Invoke Tauri command to execute Rhai script
  this.setOutputData(1, input);
  this.triggerSlot(0);
};

RhaiScriptNode.title = "Rhai Script";
RhaiScriptNode.desc = "Execute a Rhai script";

export function register() {
  LiteGraph.registerNodeType("script/rhai", RhaiScriptNode as any);
}
