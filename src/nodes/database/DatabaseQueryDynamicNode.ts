import { LiteGraph } from "litegraph.js";

export function DatabaseQueryDynamicNode(this: any) {
  this.addInput("query", "string");
  this.addOutput("results", "string");
  this.size = [220, 60];
}

DatabaseQueryDynamicNode.title = "DB Query (Dynamic)";
DatabaseQueryDynamicNode.desc = "Execute a database query provided as an input string";

export function register() {
  LiteGraph.registerNodeType(
    "database/query_dynamic",
    DatabaseQueryDynamicNode as any
  );
}
