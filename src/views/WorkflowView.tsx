import { onMount, onCleanup, createSignal, createEffect, Show } from "solid-js";
import { LGraph, LGraphCanvas } from "litegraph.js";
import "litegraph.js/css/litegraph.css";
import { configureLiteGraphTheme, registerAllNodes } from "../nodes";
import { saveWorkflow, loadWorkflow } from "../lib/tauri";

/**
 * Override deleteSelectedNodes to remove LiteGraph's "autoconnect when possible" behavior.
 * By default, deleting a node that has both an input and output on slot 0 reconnects
 * the upstream node to the downstream node, which is surprising (e.g. deleting a DB node
 * can autolink the wrong output to the wrong input). We only remove nodes and clear selection.
 */
function patchDeleteSelectedNodes(): void {
  const proto = LGraphCanvas.prototype as unknown as {
    deleteSelectedNodes: () => void;
    graph: { beforeChange?: () => void; afterChange?: () => void };
    selected_nodes: Record<number, { block_delete?: boolean; id: number }>;
    current_node: unknown;
    highlighted_links: Record<unknown, unknown>;
    setDirty: (a: boolean, b?: boolean) => void;
    onNodeDeselected?: (node: unknown) => void;
  };
  proto.deleteSelectedNodes = function (this: typeof proto) {
    if (this.graph.beforeChange) this.graph.beforeChange();
    for (const id in this.selected_nodes) {
      const node = this.selected_nodes[id];
      if (node?.block_delete) continue;
      (this.graph as { remove: (n: unknown) => void }).remove(node);
      if (this.onNodeDeselected) this.onNodeDeselected(node);
    }
    this.selected_nodes = {};
    this.current_node = null;
    this.highlighted_links = {};
    this.setDirty(true);
    if (this.graph.afterChange) this.graph.afterChange();
  };
}
patchDeleteSelectedNodes();

interface WorkflowViewProps {
  /** When false, the canvas render loop is paused to save CPU (e.g. when another tab is active). */
  isActive?: boolean;
}

export function WorkflowView(props: WorkflowViewProps) {
  const isActive = () => props.isActive !== false;
  let canvasRef: HTMLCanvasElement | undefined;
  let graph: LGraph | undefined;
  let graphCanvas: LGraphCanvas | undefined;
  const [canvasInstance, setCanvasInstance] = createSignal<LGraphCanvas | null>(null);
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Pause canvas render loop when workflow tab is not active (saves CPU)
  createEffect(() => {
    const canvas = canvasInstance();
    if (!canvas) return;
    const active = isActive();
    (canvas as { pause_rendering?: boolean }).pause_rendering = !active;
    if (active) {
      canvas.setDirty(true, true);
    }
  });

  const handleSave = async () => {
    if (!graph || saving()) return;

    setError(null);
    setSaving(true);
    try {
      const data = graph.serialize();
      await saveWorkflow(data);
      setDirty(false);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  };

  const handleReload = async () => {
    if (!graph || !graphCanvas) return;
    setError(null);
    try {
      const savedWorkflow = await loadWorkflow();
      if (savedWorkflow !== null && savedWorkflow !== undefined) {
        graph.configure(savedWorkflow as object);
        setDirty(false);
        graphCanvas.setDirty(true, true);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to reload workflow");
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
      render_canvas_border: false,
    } as { autoresize: boolean; render_canvas_border?: boolean });

    // Configure canvas styling (lower-quality options to reduce CPU/GPU load)
    graphCanvas.highquality_render = false;
    graphCanvas.always_render_background = false;
    graphCanvas.render_canvas_border = false;
    graphCanvas.render_shadows = false;
    // Match LiteGraph's visible-area fill to our background so no lighter "box" shows
    (graphCanvas as { clear_background_color?: string }).clear_background_color = "#1a1a1a";
    graphCanvas.render_connections_shadows = false;
    graphCanvas.render_curved_connections = true;
    graphCanvas.render_connection_arrows = false;
    graphCanvas.connections_width = 3;
    graphCanvas.default_link_color = "#646cff";

    // Custom background drawing for our dark theme.
    // We draw after LiteGraph's drawGroups, so we must redraw groups on top of our background.
    // Fill in pixel space so we cover the whole canvas (LiteGraph's ctx is in graph space).
    graphCanvas.onDrawBackground = (ctx: CanvasRenderingContext2D) => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();

      // Redraw groups on top of our background (LiteGraph draws them before this callback)
      if (!(graphCanvas as { live_mode?: boolean }).live_mode) {
        graphCanvas!.drawGroups(canvasRef!, ctx);
      }
    };

    // Cover the canvas edge so any border (LiteGraph or browser) is hidden
    graphCanvas.onDrawForeground = (ctx: CanvasRenderingContext2D) => {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#1a1a1a";
      const d = 2; // cover 2px edge
      ctx.fillRect(0, 0, w, d);
      ctx.fillRect(0, h - d, w, d);
      ctx.fillRect(0, d, d, h - 2 * d);
      ctx.fillRect(w - d, d, d, h - 2 * d);
      ctx.restore();
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

    // Start rendering and expose canvas so effect can toggle pause_rendering
    setCanvasInstance(graphCanvas);
    graphCanvas.startRendering();

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        handleSave();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    onCleanup(() => {
      setCanvasInstance(null);
      document.removeEventListener("keydown", onKeyDown);
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
    <div class="workflow-editor flex flex-col h-full w-full overflow-hidden">
      {/* Toolbar */}
      <Show when={error()}>
        <div class="px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm">
          {error()}
        </div>
      </Show>
      <div class="flex items-center gap-2 px-3 py-2 bg-bg-secondary border-b border-border">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving()}
          class={`py-1.5 px-4 rounded-md disabled:opacity-50 text-sm font-medium transition-colors cursor-pointer shadow-lg ${
            dirty()
              ? "bg-accent hover:bg-accent-hover text-white"
              : "bg-bg-tertiary hover:bg-border text-text-secondary"
          }`}
        >
          {saving() ? "Saving…" : "Save"}
        </button>
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

      {/* Canvas container - match canvas background so no edge is visible */}
      <div class="workflow-canvas-container flex-1 relative overflow-hidden bg-bg-primary">
        <canvas
          ref={canvasRef}
          class="workflow-canvas absolute inset-0 w-full h-full block"
          style={{ border: "none", outline: "none" }}
        />
      </div>
    </div>
  );
}
