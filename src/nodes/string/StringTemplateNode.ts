import { LiteGraph } from "litegraph.js";

export function StringTemplateNode(this: any) {
  this.addInput("trigger", LiteGraph.ACTION);
  this.addInput("data", "object");
  this.addOutput("done", LiteGraph.EVENT);
  this.addOutput("result", "string");
  this.properties = { template: "Hello, {{name}}!" };
  this.addWidget("text", "Template", this.properties.template, (v: string) => {
    this.properties.template = v;
  });
}

StringTemplateNode.prototype.onAction = function(this: any) {
  let result = this.properties.template;
  const data = this.getInputData(1) || {};
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
  }
  this.setOutputData(1, result);
  this.triggerSlot(0);
};

StringTemplateNode.title = "Template";
StringTemplateNode.desc = "Format a string template";

export function register() {
  LiteGraph.registerNodeType("string/template", StringTemplateNode as any);
}
