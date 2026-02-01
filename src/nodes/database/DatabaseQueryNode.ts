import { LiteGraph } from "litegraph.js";

export function DatabaseQueryNode(this: any) {
  this.addInput("trigger", LiteGraph.ACTION);
  this.addInput("params", "object");
  this.addOutput("done", LiteGraph.EVENT);
  this.addOutput("results", "array");
  this.properties = { query: "SELECT * FROM events LIMIT 10" };
  this.addWidget("text", "Query", this.properties.query, (v: string) => {
    this.properties.query = v;
  });
}

DatabaseQueryNode.prototype.onAction = function(this: any) {
  console.log("Execute query:", this.properties.query);
  // TODO: Invoke Tauri command to execute DuckDB query
  this.setOutputData(1, []);
  this.triggerSlot(0);
};

DatabaseQueryNode.title = "DB Query";
DatabaseQueryNode.desc = "Execute a database query";

export function register() {
  LiteGraph.registerNodeType("database/query", DatabaseQueryNode as any);
}
