import { LiteGraph } from "litegraph.js";

export function DatabaseQueryNode(this: any) {
  this.addInput("input1", "string");
  this.addInput("input2", "string");
  this.addInput("input3", "string");
  this.addInput("input4", "string");
  this.addInput("input5", "string");
  this.addOutput("results", "string");
  this.properties = { query: "SELECT * FROM events LIMIT 10" };
  this.addWidget("text", "Query", this.properties.query, (v: string) => {
    this.properties.query = v;
  }, { multiline: true });
  this.serialize_widgets = true;
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
