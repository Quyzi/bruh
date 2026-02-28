import { LiteGraph } from "litegraph.js";
import { getSecret } from "../../lib/tauri";

export function GetSecretNode(this: any) {
  this.properties = { key: "" };
  this.addWidget("text", "Key", this.properties.key, (value: string) => {
    this.properties.key = value;
  });
  this.addOutput("value", "string");
  this.serialize_widgets = true;
}

GetSecretNode.prototype.onAction = async function (this: any) {
  const key = (this.properties.key ?? "").trim();
  if (!key) {
    this.setOutputData(0, "");
    this.triggerSlot(0);
    return;
  }
  try {
    const value = await getSecret(key);
    this.setOutputData(0, value);
    this.triggerSlot(0);
  } catch (_e) {
    this.setOutputData(0, "");
    this.triggerSlot(0);
  }
};

GetSecretNode.title = "Get Secret";
GetSecretNode.desc = "Retrieve a secret value";

export function register() {
  LiteGraph.registerNodeType("secrets/get", GetSecretNode as any);
}
