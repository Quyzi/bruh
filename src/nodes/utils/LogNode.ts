import { LiteGraph } from "litegraph.js";

export function LogNode(this: any) {
  this.addInput("trigger", LiteGraph.ACTION);
  this.addInput("value", "any");
  this.addOutput("done", LiteGraph.EVENT);
  this.addOutput("passthrough", "any");
  this.properties = { prefix: "[LOG]" };
  this.addWidget("text", "Prefix", this.properties.prefix, (v: string) => {
    this.properties.prefix = v;
  });
}

LogNode.prototype.onAction = function(this: any) {
  const value = this.getInputData(1);
  console.log(this.properties.prefix, value);
  this.setOutputData(1, value);
  this.triggerSlot(0);
};

LogNode.title = "Log";
LogNode.desc = "Log a value to console";

export function register() {
  LiteGraph.registerNodeType("utils/log", LogNode as any);
}
