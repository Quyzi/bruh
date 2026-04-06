import { LiteGraph } from "litegraph.js";

export function OverlayDisplayNode(this: any) {
  this.addInput("channel", "string");
  this.addInput("user", "string");
  this.addInput("message", "string");
  this.addInput("duration", "number");
}

OverlayDisplayNode.title = "Overlay Display";
OverlayDisplayNode.desc = "Display an overlay on the stream";

export function register() {
  LiteGraph.registerNodeType("overlay/display", OverlayDisplayNode as any);
}