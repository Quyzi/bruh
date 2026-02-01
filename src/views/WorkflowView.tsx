import { onMount, onCleanup, createSignal } from "solid-js";
import { LGraph, LGraphCanvas } from "litegraph.js";
import "litegraph.js/css/litegraph.css";
import { configureLiteGraphTheme, registerAllNodes } from "../nodes";
import { saveWorkflow, loadWorkflow } from "../lib/tauri";

export function WorkflowView() {
  let canvasRef: HTMLCanvasElement | undefined;
  let graph: LGraph | undefined;
  let graphCanvas: LGraphCanvas | undefined;
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [saveStatus, setSaveStatus] = createSignal<string | null>(null);

  const handleSave = async () => {
    if (!graph || saving()) return;

    setSaving(true);
    setSaveStatus(null);

    try {
      const data = graph.serialize();
      await saveWorkflow(data);
      setDirty(false);
      setSaveStatus("Saved");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error("Failed to save workflow:", err);
      setSaveStatus("Error saving");
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleReload = async () => {
    if (!graph || !graphCanvas) return;
    try {
      const savedWorkflow = await loadWorkflow();
      if (savedWorkflow !== null && savedWorkflow !== undefined) {
        graph.configure(savedWorkflow as object);
        setDirty(false);
        graphCanvas.setDirty(true, true);
      }
    } catch (err) {
      console.error("Failed to reload workflow:", err);
    }
  };

  onMount(async () => {
    if (!canvasRef) return;

    // Configure theme
    configureLiteGraphTheme();

    // Register custom nodes
    registerAllNodes();

    // Create graph
    graph = new LGraph();

    // Load existing workflow if it exists
    try {
      const savedWorkflow = await loadWorkflow();
      if (savedWorkflow !== null && savedWorkflow !== undefined) {
        graph.configure(savedWorkflow as object);
        setDirty(false);
        console.log("Loaded existing workflow");
      }
    } catch (err) {
      console.error("Failed to load workflow:", err);
    }

    // Mark dirty when graph changes (on_change exists at runtime; not in litegraph.d.ts)
    (graph as { on_change?: (g: LGraph) => void }).on_change = () => setDirty(true);

    // Create canvas
    graphCanvas = new LGraphCanvas(canvasRef, graph, {
      autoresize: true,
    });

    // Configure canvas styling
    graphCanvas.highquality_render = true;
    graphCanvas.always_render_background = true;
    graphCanvas.render_shadows = true;
    graphCanvas.render_connections_shadows = false;
    graphCanvas.render_curved_connections = true;
    graphCanvas.render_connection_arrows = false;
    graphCanvas.connections_width = 3;
    graphCanvas.default_link_color = "#646cff";
    graphCanvas.highquality_render = true;

    // Custom background drawing for our dark theme.
    // We draw after LiteGraph's drawGroups, so we must redraw groups on top of our background.
    graphCanvas.onDrawBackground = (ctx: CanvasRenderingContext2D) => {
      // Fill background
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

      // Draw grid
      const gridSize = 20;
      ctx.strokeStyle = "#252525";
      ctx.lineWidth = 1;

      const offset = graphCanvas!.ds.offset;
      const scale = graphCanvas!.ds.scale;

      const startX = (-offset[0] / scale) % gridSize;
      const startY = (-offset[1] / scale) % gridSize;

      ctx.beginPath();
      for (let x = startX; x < ctx.canvas.width / scale; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, ctx.canvas.height / scale);
      }
      for (let y = startY; y < ctx.canvas.height / scale; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(ctx.canvas.width / scale, y);
      }
      ctx.stroke();

      // Redraw groups on top of our background (LiteGraph draws them before this callback)
      if (!(graphCanvas as { live_mode?: boolean }).live_mode) {
        graphCanvas!.drawGroups(canvasRef!, ctx);
      }
    };

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (canvasRef && graphCanvas) {
        const parent = canvasRef.parentElement;
        if (parent) {
          canvasRef.width = parent.clientWidth;
          canvasRef.height = parent.clientHeight;
          graphCanvas.setDirty(true, true);
        }
      }
    });

    if (canvasRef.parentElement) {
      resizeObserver.observe(canvasRef.parentElement);
    }

    // Initial size
    const parent = canvasRef.parentElement;
    if (parent) {
      canvasRef.width = parent.clientWidth;
      canvasRef.height = parent.clientHeight;
    }

    // Start rendering
    graphCanvas.startRendering();

    onCleanup(() => {
      resizeObserver.disconnect();
      if (graphCanvas) {
        graphCanvas.stopRendering();
      }
      if (graph) {
        graph.clear();
      }
    });
  });

  return (
    <div class="flex flex-col h-full w-full overflow-hidden">
      {/* Toolbar */}
      <div class="flex items-center gap-2 px-3 py-2 bg-bg-secondary border-b border-border">
        <button
          class="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-border rounded text-text-primary transition-colors disabled:opacity-50"
          onClick={handleSave}
          disabled={saving()}
        >
          {saving() ? "Saving..." : "Save"}
        </button>
        {dirty() && (
          <span class="text-xs text-amber-400" title="Unsaved changes">
            • Unsaved
          </span>
        )}
        {saveStatus() && (
          <span class={`text-xs ${saveStatus() === "Saved" ? "text-success" : "text-error"}`}>
            {saveStatus()}
          </span>
        )}
        <button
          class="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-border rounded text-text-primary transition-colors"
          onClick={handleReload}
          title="Reload workflow from disk"
        >
          Reload
        </button>
        <button
          class="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-border rounded text-text-primary transition-colors"
          onClick={() => {
            if (graph) {
              graph.clear();
              graphCanvas?.setDirty(true, true);
            }
          }}
        >
          Clear
        </button>
        <button
          class="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-border rounded text-text-primary transition-colors"
          onClick={() => {
            if (graphCanvas) {
              graphCanvas.ds.reset();
              graphCanvas.setDirty(true, true);
            }
          }}
        >
          Reset View
        </button>
        <div class="flex-1" />
        <span class="text-xs text-text-secondary">
          Right-click to add nodes • Scroll to zoom • Drag to pan
        </span>
      </div>

      {/* Canvas container */}
      <div class="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          class="absolute inset-0"
        />
      </div>
    </div>
  );
}
