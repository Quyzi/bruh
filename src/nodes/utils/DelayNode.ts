import { LiteGraph } from "litegraph.js";

export function DelayNode(this: any) {
  this.addInput("trigger", LiteGraph.ACTION);
  this.addOutput("done", LiteGraph.EVENT);
  this.properties = { delay: 1000 };
  this.addWidget("number", "Delay (ms)", this.properties.delay, (v: number) => {
    this.properties.delay = v;
  }, { min: 0, max: 60000, step: 100 });
}

DelayNode.prototype.onAction = function(this: any) {
  setTimeout(() => {
    this.triggerSlot(0);
  }, this.properties.delay);
};

DelayNode.title = "Delay";
DelayNode.desc = "Wait for a specified time";

export function register() {
  LiteGraph.registerNodeType("utils/delay", DelayNode as any);
}
