import { LiteGraph } from "litegraph.js";

const TEXTAREA_HEIGHT = 200;

export function RhaiScriptNode(this: any) {
  this.addInput("trigger", LiteGraph.ACTION);
  this.addInput("input", "any");
  this.addOutput("done", LiteGraph.EVENT);
  this.addOutput("result", "any");
  this.properties = { script: "// Rhai script\nlet result = input;\nresult" };

  // Custom textarea widget
  const widget = this.addCustomWidget({
    name: "script",
    type: "textarea",
    value: this.properties.script,
    draw: function (
      ctx: CanvasRenderingContext2D,
      node: any,
      widgetWidth: number,
      y: number
    ) {
      const margin = 10;
      const width = widgetWidth - margin * 2;

      // Background
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(margin, y, width, TEXTAREA_HEIGHT);

      // Border
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 1;
      ctx.strokeRect(margin, y, width, TEXTAREA_HEIGHT);

      // Text
      ctx.fillStyle = "#b0b0b0";
      ctx.font = "12px monospace";
      const lines = (node.properties.script || "").split("\n");
      const lineHeight = 16;
      const padding = 6;

      ctx.save();
      ctx.beginPath();
      ctx.rect(margin, y, width, TEXTAREA_HEIGHT);
      ctx.clip();

      for (let i = 0; i < lines.length; i++) {
        const textY = y + padding + lineHeight * (i + 1) - 3;
        if (textY > y + TEXTAREA_HEIGHT) break;
        ctx.fillText(lines[i], margin + padding, textY);
      }

      ctx.restore();

      return TEXTAREA_HEIGHT;
    },
    mouse: function (event: any, _pos: [number, number], node: any) {
      if (event.type === "pointerdown") {
        // Open a prompt for editing
        const newValue = prompt("Edit Rhai Script:", node.properties.script);
        if (newValue !== null) {
          node.properties.script = newValue;
          this.value = newValue;
          node.setDirtyCanvas(true);
        }
        return true;
      }
      return false;
    },
    computeSize: function () {
      return [0, TEXTAREA_HEIGHT + 10];
    },
  });

  widget.value = this.properties.script;
  this.size = [400, 300];
}

RhaiScriptNode.prototype.onAction = function (this: any) {
  const input = this.getInputData(1);
  console.log("Run Rhai script with input:", input);
  // TODO: Invoke Tauri command to execute Rhai script
  this.setOutputData(1, input);
  this.triggerSlot(0);
};

RhaiScriptNode.title = "Rhai Script";
RhaiScriptNode.desc = "Execute a Rhai script";

export function register() {
  LiteGraph.registerNodeType("script/rhai", RhaiScriptNode as any);
}
