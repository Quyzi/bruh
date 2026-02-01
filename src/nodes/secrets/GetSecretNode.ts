import { LiteGraph } from "litegraph.js";

export function GetSecretNode(this: any) {
  this.addInput("name", "string");
  this.addOutput("value", "string");
  this.properties = { key: "" };
}

GetSecretNode.prototype.onAction = function(this: any) {
  console.log("Get secret:", this.properties.key);
  // TODO: Invoke Tauri command to retrieve secret
  this.setOutputData(1, "");
  this.triggerSlot(0);
};

GetSecretNode.title = "Get Secret";
GetSecretNode.desc = "Retrieve a secret value";

export function register() {
  LiteGraph.registerNodeType("secrets/get", GetSecretNode as any);
}
