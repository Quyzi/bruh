import { LiteGraph } from "litegraph.js";

export function TimerNode(this: any) {
  this.properties = { periodSeconds: "60" };
  this.addWidget(
    "text",
    "Seconds",
    this.properties.periodSeconds,
    (value: string) => {
      this.properties.periodSeconds = value;
    }
  );
  this.addOutput("interval_seconds", "string");
  this.serialize_widgets = true;
}

TimerNode.title = "Timer";
TimerNode.desc = "Fires once every N seconds";

export function register() {
  LiteGraph.registerNodeType("utilities/Timer", TimerNode as any);
}
