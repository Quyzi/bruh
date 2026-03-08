import { LiteGraph } from "litegraph.js";
import { setSecret } from "../../lib/tauri";

export function SetSecretNode(this: any) {
  this.properties = { key: "" };
  this.addWidget("text", "Key", this.properties.key, (value: string) => {
    this.properties.key = value;
  });
  this.addInput("key", "string");
  this.addInput("value", "string");
  this.serialize_widgets = true;
}

SetSecretNode.prototype.onAction = async function (this: any) {
  const key = (
    (this.getInputData(0) as string | undefined) ??
    this.properties.key ??
    ""
  ).trim();
  if (!key) return;
  const value = String(this.getInputData(1) ?? "");
  try {
    await setSecret(key, value);
  } catch (_e) {
    // silently fail; backend logs the error
  }
};

SetSecretNode.title = "Set Secret";
SetSecretNode.desc = "Store a secret value";

export function register() {
  LiteGraph.registerNodeType("secrets/set", SetSecretNode as any);
}
