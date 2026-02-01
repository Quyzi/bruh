import { LiteGraph } from "litegraph.js";

export function GetSecretNode(this: any) {
  this.addInput("trigger", LiteGraph.ACTION);
  this.addOutput("done", LiteGraph.EVENT);
  this.addOutput("value", "string");
  this.properties = { key: "" };
  this.addWidget("text", "Key", this.properties.key, (v: string) => {
    this.properties.key = v;
  });
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
