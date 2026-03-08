import { LiteGraph } from "litegraph.js";
import { listSecrets } from "../../lib/tauri";

export function ListSecretsNode(this: any) {
  this.addOutput("names", "string");
}

ListSecretsNode.prototype.onAction = async function (this: any) {
  try {
    const names = await listSecrets();
    this.setOutputData(0, JSON.stringify(names));
    this.triggerSlot(0);
  } catch (_e) {
    this.setOutputData(0, "[]");
    this.triggerSlot(0);
  }
};

ListSecretsNode.title = "List Secrets";
ListSecretsNode.desc = "List all secret names";

export function register() {
  LiteGraph.registerNodeType("secrets/list", ListSecretsNode as any);
}
