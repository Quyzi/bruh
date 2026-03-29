import { LiteGraph, LGraphCanvas } from "litegraph.js";

const LINE_H = 14;
const PADDING = 8;
const MIN_LINES = 3;

function addTemplateWidget(node: any, initialValue: string) {
  const widget: any = {
    type: "custom_textarea",
    name: "Template",
    value: initialValue,
    options: {},
    _activeTextarea: null as HTMLTextAreaElement | null,

    computeSize(width: number): [number, number] {
      const lineCount = Math.max(MIN_LINES, widget.value.split("\n").length);
      return [width, lineCount * LINE_H + PADDING * 2 + 4];
    },

    draw(ctx: CanvasRenderingContext2D, node: any, widget_width: number, y: number, _H: number) {
      const minH = widget.computeSize(widget_width)[1];
      const height = Math.max(minH, node.size[1] - y - 4);
      const margin = 6;

      ctx.fillStyle = "#161622";
      ctx.strokeStyle = widget._activeTextarea ? "#646cff" : "#3a3a50";
      ctx.lineWidth = 1;
      ctx.beginPath();
      (ctx as any).roundRect(margin, y, widget_width - margin * 2, height, [4]);
      ctx.fill();
      ctx.stroke();

      if (!widget._activeTextarea) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(margin + 1, y + 1, widget_width - margin * 2 - 2, height - 2);
        ctx.clip();
        ctx.font = "11px monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = "#a0a0c0";

        const innerWidth = widget_width - margin * 2 - PADDING * 2;
        let lineY = y + PADDING + LINE_H - 2;
        for (const raw of widget.value.split("\n")) {
          if (!raw) {
            lineY += LINE_H;
            continue;
          }
          let cur = "";
          for (const word of raw.split(" ")) {
            const test = cur ? cur + " " + word : word;
            if (ctx.measureText(test).width > innerWidth && cur) {
              ctx.fillText(cur, margin + PADDING, lineY);
              lineY += LINE_H;
              cur = word;
            } else {
              cur = test;
            }
          }
          if (cur) {
            ctx.fillText(cur, margin + PADDING, lineY);
            lineY += LINE_H;
          }
        }
        ctx.restore();
      }
    },

    mouse(event: MouseEvent, _pos: [number, number], node: any) {
      if (event.type !== (LiteGraph as any).pointerevents_method + "down") return false;
      if (widget._activeTextarea) {
        widget._activeTextarea.focus();
        return true;
      }

      const lgCanvas = (LGraphCanvas as any).active_canvas;
      if (!lgCanvas) return false;
      const canvas = lgCanvas.canvas as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const ds = lgCanvas.ds;

      const graphX = node.pos[0] + 6;
      const graphY = node.pos[1] + (widget.last_y ?? 0);
      const screenX = (graphX + ds.offset[0]) * ds.scale + rect.left;
      const screenY = (graphY + ds.offset[1]) * ds.scale + rect.top;
      const screenW = (node.size[0] - 12) * ds.scale;
      const lastY = widget.last_y ?? 0;
      const minH = widget.computeSize(node.size[0])[1];
      const screenH = Math.max(minH, node.size[1] - lastY - 4) * ds.scale;

      const ta = document.createElement("textarea");
      ta.value = widget.value;
      ta.style.cssText = `
        position: fixed;
        left: ${screenX}px;
        top: ${screenY}px;
        width: ${screenW}px;
        height: ${screenH}px;
        font-family: monospace;
        font-size: ${11 * ds.scale}px;
        line-height: ${LINE_H * ds.scale}px;
        background: #161622;
        color: #a0a0c0;
        border: 1.5px solid #646cff;
        border-radius: 4px;
        padding: ${PADDING * ds.scale}px;
        resize: none;
        box-sizing: border-box;
        z-index: 9999;
        outline: none;
        overflow: auto;
        white-space: pre;
        caret-color: #646cff;
      `;
      document.body.appendChild(ta);
      widget._activeTextarea = ta;
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }, 0);
      node.setDirtyCanvas(true, true);

      const commit = () => {
        widget.value = ta.value;
        node.properties.template = ta.value;
        if (node.graph) node.graph._version++;
        cleanup();
      };

      const cleanup = () => {
        if (ta.parentNode) ta.parentNode.removeChild(ta);
        widget._activeTextarea = null;
        node.setDirtyCanvas(true, true);
      };

      ta.addEventListener("blur", commit);
      ta.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cleanup();
        }
      });

      return true;
    },
  };

  node.widgets = node.widgets ?? [];
  node.widgets.push(widget);
  return widget;
}

export function BroadcastChatFormattedNode(this: any) {
  this.addInput("param1 (?1)", "string");
  this.addInput("param2 (?2)", "string");
  this.addInput("param3 (?3)", "string");
  this.addInput("param4 (?4)", "string");
  this.addInput("param5 (?5)", "string");
  this.properties = { template: "Hi ?1, thanks for the follow!" };
  addTemplateWidget(this, this.properties.template);
  this.serialize_widgets = true;
  // 5 slots × NODE_SLOT_HEIGHT(20) + widget min height + widget margin(12) + node margin(6)
  this.size = [300, 5 * 20 + MIN_LINES * LINE_H + PADDING * 2 + 4 + 18];
}

BroadcastChatFormattedNode.prototype.onRemoved = function (this: any) {
  const w = this.widgets?.[0];
  if (w?._activeTextarea?.parentNode) {
    w._activeTextarea.parentNode.removeChild(w._activeTextarea);
    w._activeTextarea = null;
  }
};

BroadcastChatFormattedNode.title = "Broadcast Chat Formatted";
BroadcastChatFormattedNode.desc = "Send a formatted message to all connected channels. Use ?1-?5 as placeholders.";

export function register() {
  LiteGraph.registerNodeType("twitch/broadcast_chat_formatted", BroadcastChatFormattedNode as any);
}
