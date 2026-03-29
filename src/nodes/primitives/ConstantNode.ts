import { LiteGraph } from "litegraph.js";

export function ConstantNode(this: any) {
  this.properties = { value: "" };
  this.addWidget(
    "text",
    "Value",
    this.properties.value,
    (value: string) => {
      this.properties.value = value;
    }
  );
  this.addOutput("value", "string");
  this.serialize_widgets = true;
}

ConstantNode.title = "Constant";
ConstantNode.desc = "Outputs a constant string value";

export function register() {
  LiteGraph.registerNodeType("primitives/Constant", ConstantNode as any);
}
