import { LiteGraph } from "litegraph.js";
import { deleteSecret } from "../../lib/tauri";

export function DeleteSecretNode(this: any) {
  this.properties = { key: "" };
  this.addWidget("text", "Key", this.properties.key, (value: string) => {
    this.properties.key = value;
  });
  this.addInput("key", "string");
  this.serialize_widgets = true;
}

DeleteSecretNode.prototype.onAction = async function (this: any) {
  const key = (
    (this.getInputData(0) as string | undefined) ??
    this.properties.key ??
    ""
  ).trim();
  if (!key) return;
  try {
    await deleteSecret(key);
  } catch (_e) {
    // silently fail; backend logs the error
  }
};

DeleteSecretNode.title = "Delete Secret";
DeleteSecretNode.desc = "Delete a secret by name";

export function register() {
  LiteGraph.registerNodeType("secrets/delete", DeleteSecretNode as any);
}
