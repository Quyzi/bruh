import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { listen } from "@tauri-apps/api/event";
import { listenNodeExecutionDone, listenNodeExecutionStarted, loadWorkflow, saveWorkflow } from "../../lib/tauri";
import { minNodeHeight } from "../builtins";
import { ensureCatalog, getNodeDef, menuNodeDefs } from "../catalog";
import { loadLiteGraph, saveLiteGraph } from "../litegraphDoc";
import type { WorkflowEditorProps } from "../editorProps";
import type { FlowNodeData, GraphEdge, GraphNode, GraphState, NodeDef } from "../types";
import FlowNode, { NodeEditContext, RunningContext, type BruhNode, type NodeUpdate } from "./FlowNode";
import "./flow.css";

const nodeTypes = { bruh: FlowNode };

interface MenuState {
  x: number;
  y: number;
  flow: { x: number; y: number };
}

interface MenuItem {
  label: string;
  path: string;
  def?: NodeDef;
  children?: MenuItem[];
}

export function mountWorkflowEditor(host: HTMLElement, props: WorkflowEditorProps): () => void {
  const root = createRoot(host);
  root.render(<WorkflowEditor {...props} />);
  return () => root.unmount();
}

function WorkflowEditor({ getActive, subscribeActive, onSaved }: WorkflowEditorProps) {
  const [nodes, setNodes] = useState<BruhNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(getActive);
  const [running, setRunning] = useState<ReadonlySet<string>>(new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [query, setQuery] = useState("");
  const shellRef = useRef<GraphState["shell"]>({});
  const nodeSeq = useRef(0);
  const linkSeq = useRef(0);
  const flowRef = useRef<ReactFlowInstance<BruhNode, Edge> | null>(null);
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const readyRef = useRef(false);
  const savingRef = useRef(false);
  const revision = useRef(0);
  const loadGen = useRef(0);

  const applyDocument = useCallback((doc: unknown) => {
    ensureCatalog();
    const graph = loadLiteGraph(doc);
    shellRef.current = graph.shell;
    nodeSeq.current = graph.lastNodeId;
    linkSeq.current = graph.lastLinkId;
    setNodes(graph.nodes.map(toFlowNode));
    setEdges(graph.edges.map(toFlowEdge));
  }, []);

  const markDirty = useCallback(() => {
    revision.current += 1;
    setDirty(true);
  }, []);

  const loadFromDisk = useCallback(
    async (fallback: string) => {
      const gen = ++loadGen.current;
      setError(null);
      try {
        const saved = await loadWorkflow();
        if (gen !== loadGen.current) return;
        applyDocument(saved);
        revision.current += 1;
        setDirty(false);
        readyRef.current = true;
        setReady(true);
      } catch (err: unknown) {
        if (gen !== loadGen.current) return;
        setError(messageOf(err, fallback));
      }
    },
    [applyDocument]
  );

  useEffect(() => subscribeActive(setActive), [subscribeActive]);

  useEffect(() => {
    void loadFromDisk("Failed to load workflow");
    return () => {
      loadGen.current += 1;
    };
  }, [loadFromDisk]);

  useEffect(() => {
    const runningIds = new Set<string>();
    const publish = () => setRunning(new Set(runningIds));
    const started = listenNodeExecutionStarted((payload) => {
      runningIds.add(String(payload.nodeId));
      publish();
    });
    const done = listenNodeExecutionDone((payload) => {
      runningIds.delete(String(payload.nodeId));
      publish();
    });
    return () => {
      void started.then((stop) => stop());
      void done.then((stop) => stop());
    };
  }, []);

  const updateNode = useCallback<NodeUpdate>((id, recipe) => {
    setNodes((current) => {
      let did = false;
      const next = current.map((node) => {
        if (node.id !== id) return node;
        const data = recipe(node.data);
        if (data === node.data) return node;
        did = true;
        return { ...node, data };
      });
      return did ? next : current;
    });
    markDirty();
  }, [markDirty]);

  const onNodesChange = useCallback((changes: NodeChange<BruhNode>[]) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current);
      return next.map((node) => {
        const change = changes.find(
          (entry) => entry.type === "dimensions" && entry.id === node.id && entry.resizing === false
        );
        if (!change || change.type !== "dimensions" || !change.dimensions) return node;
        const width = change.dimensions.width;
        const height = change.dimensions.height;
        return {
          ...node,
          width,
          height,
          style: { ...node.style, width, height },
        };
      });
    });
    if (changes.some(nodeChangeIsEdit)) markDirty();
  }, [markDirty]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
    if (changes.some(edgeChangeIsEdit)) markDirty();
  }, [markDirty]);

  const onConnect = useCallback((connection: Connection) => {
    if (!canConnect(connection, edgesRef.current)) return;
    setEdges((current) => {
      if (!canConnect(connection, current)) return current;
      linkSeq.current += 1;
      return addEdge({ ...connection, id: String(linkSeq.current) }, current);
    });
    markDirty();
  }, [markDirty]);

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    return canConnect(connection, edgesRef.current);
  }, []);

  const graphState = useCallback((): GraphState => {
    return {
      nodes: nodes.map(fromFlowNode),
      edges: edges.map(fromFlowEdge),
      shell: shellRef.current,
      lastNodeId: nodeSeq.current,
      lastLinkId: linkSeq.current,
    };
  }, [nodes, edges]);

  const handleSave = useCallback(async () => {
    if (!readyRef.current || savingRef.current) return;
    const savedRevision = revision.current;
    const savedLoad = loadGen.current;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const doc = saveLiteGraph(graphState());
      if (!readyRef.current || savedLoad !== loadGen.current) return;
      await saveWorkflow(doc);
      if (savedLoad !== loadGen.current) return;
      const stored = loadLiteGraph(doc);
      shellRef.current = stored.shell;
      nodeSeq.current = stored.lastNodeId;
      linkSeq.current = stored.lastLinkId;
      if (revision.current === savedRevision) setDirty(false);
      onSaved();
    } catch (err: unknown) {
      setError(messageOf(err, "Failed to save workflow"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [graphState, onSaved]);

  const reload = useCallback(() => {
    void loadFromDisk("Failed to reload workflow");
  }, [loadFromDisk]);

  useEffect(() => {
    const unlisten = listen("bruh://data-restored", () => {
      void reload();
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [reload]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!active || !readyRef.current) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        void handleSave();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, handleSave]);

  const addNode = useCallback((def: NodeDef, position: { x: number; y: number }) => {
    nodeSeq.current += 1;
    const id = String(nodeSeq.current);
    const data: FlowNodeData = {
      liteType: def.type,
      title: def.title,
      properties: { ...def.properties },
      inputs: def.inputs.map((port) => ({ ...port })),
      outputs: def.outputs.map((port) => ({ ...port })),
      rest: {},
      autoPick: def.fields.some((field) => field.kind === "combo"),
    };
    const height = Math.max(def.height, minNodeHeight(def));
    const node: BruhNode = {
      id,
      type: "bruh",
      position,
      width: def.width,
      height,
      style: { width: def.width, height },
      data,
    };
    setNodes((current) => [...current, node]);
    markDirty();
    setMenu(null);
    setQuery("");
  }, [markDirty]);

  const openMenu = useCallback((clientX: number, clientY: number, flow: { x: number; y: number }) => {
    const menuWidth = 280;
    const menuHeight = Math.min(window.innerHeight * 0.7, 520);
    const x = Math.min(clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(clientY, window.innerHeight - menuHeight - 8);
    setMenu({ x: Math.max(8, x), y: Math.max(8, y), flow });
    setQuery("");
  }, []);

  const defs = useMemo(() => menuNodeDefs(), []);
  const tree = useMemo(() => menuTree(defs), [defs]);

  return (
    <div className="workflow-editor__frame overflow-hidden">
      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">{error}</div>
      )}
      <div className="flex items-center gap-2 border-b border-border bg-bg-secondary px-3 py-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!ready || saving}
          className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium shadow-lg transition-colors disabled:opacity-50 ${
            dirty ? "bg-accent text-white hover:bg-accent-hover" : "bg-bg-tertiary text-text-secondary hover:bg-border"
          }`}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" className={toolButton} onClick={reload} title="Reload workflow from disk">
          Reload
        </button>
        <button
          type="button"
          className={toolButton}
          disabled={!ready}
          onClick={() => {
            if (!readyRef.current) return;
            shellRef.current = {};
            setNodes([]);
            setEdges([]);
            markDirty();
          }}
        >
          Clear
        </button>
        <button
          type="button"
          className={toolButton}
          disabled={!ready}
          onClick={() => flowRef.current?.setViewport({ x: 0, y: 0, zoom: 1 })}
        >
          Reset View
        </button>
        <button
          type="button"
          className={toolButton}
          disabled={!ready}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const flow = flowRef.current?.screenToFlowPosition({
              x: rect.left + 40,
              y: rect.bottom + 40,
            }) ?? { x: 80, y: 80 };
            openMenu(rect.left, rect.bottom + 4, flow);
          }}
        >
          Add Node
        </button>
        <div className="flex-1" />
        <span className="text-xs text-text-secondary">Right-click to add nodes · Scroll to zoom · Drag to pan</span>
      </div>
      <div className="workflow-canvas bg-bg-primary">
        {ready ? (
          <NodeEditContext.Provider value={updateNode}>
            <RunningContext.Provider value={running}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                nodeTypes={nodeTypes}
                onInit={(instance) => {
                  flowRef.current = instance;
                }}
                onPaneContextMenu={(event) => {
                  event.preventDefault();
                  const flow = flowRef.current?.screenToFlowPosition({
                    x: event.clientX,
                    y: event.clientY,
                  }) ?? { x: 0, y: 0 };
                  openMenu(event.clientX, event.clientY, flow);
                }}
                onPaneClick={() => setMenu(null)}
                onMoveStart={() => setMenu(null)}
                colorMode="dark"
                deleteKeyCode={["Backspace", "Delete"]}
                zoomOnDoubleClick={false}
                fitView={false}
                edgesReconnectable={false}
                proOptions={{ hideAttribution: false }}
                defaultEdgeOptions={{ style: { stroke: "#646cff", strokeWidth: 2 } }}
                connectionLineStyle={{ stroke: "#646cff", strokeWidth: 2 }}
              >
                <Background color="#2a2a2a" gap={24} size={1} />
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable maskColor="rgba(0,0,0,0.55)" nodeColor="#646cff" />
              </ReactFlow>
            </RunningContext.Provider>
          </NodeEditContext.Provider>
        ) : (
          <div className="p-4 text-sm text-text-secondary">
            {error ? "Workflow did not load." : "Loading workflow…"}
          </div>
        )}
        {menu && (
          <NodeMenu
            menu={menu}
            query={query}
            tree={tree}
            defs={defs}
            onQuery={setQuery}
            onPick={(def) => addNode(def, menu.flow)}
            onClose={() => setMenu(null)}
          />
        )}
      </div>
    </div>
  );
}

const toolButton =
  "rounded bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary transition-colors hover:bg-border disabled:cursor-not-allowed disabled:opacity-50";

function NodeMenu({
  menu,
  query,
  tree,
  defs,
  onQuery,
  onPick,
  onClose,
}: {
  menu: MenuState;
  query: string;
  tree: MenuItem[];
  defs: NodeDef[];
  onQuery: (value: string) => void;
  onPick: (def: NodeDef) => void;
  onClose: () => void;
}) {
  const needle = query.trim().toLowerCase();
  const flat = needle
    ? defs.filter((def) => def.title.toLowerCase().includes(needle) || def.type.toLowerCase().includes(needle))
    : [];

  return (
    <div className="bruh-menu" style={{ left: menu.x, top: menu.y }} onContextMenu={(event) => event.preventDefault()}>
      <input
        className="bruh-menu__search nodrag nopan nowheel nokey"
        autoFocus
        placeholder="Search nodes"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      />
      <div className="bruh-menu__list">
        {needle ? (
          flat.length > 0 ? (
            flat.map((def) => (
              <button key={def.type} type="button" title={def.description} onClick={() => onPick(def)}>
                {def.title}
                <span className="ml-2 text-[10px] text-text-secondary">{def.type}</span>
              </button>
            ))
          ) : (
            <div className="bruh-menu__empty">No matching nodes</div>
          )
        ) : (
          <MenuTree items={tree} depth={0} onPick={onPick} />
        )}
      </div>
    </div>
  );
}

function MenuTree({
  items,
  depth,
  onPick,
}: {
  items: MenuItem[];
  depth: number;
  onPick: (def: NodeDef) => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  return (
    <>
      {items.map((item) => {
        if (item.def) {
          return (
            <button
              key={item.path}
              type="button"
              style={{ paddingLeft: 8 + depth * 12 }}
              title={item.def.description}
              onClick={() => onPick(item.def as NodeDef)}
            >
              {item.label}
            </button>
          );
        }
        const expanded = open.has(item.path);
        return (
          <div key={item.path}>
            <button
              type="button"
              className="bruh-menu__folder"
              style={{ paddingLeft: 8 + depth * 12 }}
              onClick={() => {
                setOpen((current) => {
                  const next = new Set(current);
                  if (next.has(item.path)) next.delete(item.path);
                  else next.add(item.path);
                  return next;
                });
              }}
            >
              {expanded ? "▾" : "▸"} {item.label}
            </button>
            {expanded && item.children && (
              <MenuTree items={item.children} depth={depth + 1} onPick={onPick} />
            )}
          </div>
        );
      })}
    </>
  );
}

function menuTree(defs: NodeDef[]): MenuItem[] {
  const roots: MenuItem[] = [];
  for (const def of defs) {
    const parts = def.type.split("/");
    const folders = parts.slice(0, -1);
    let level = roots;
    let path = "";
    for (const folder of folders) {
      path = path ? `${path}/${folder}` : folder;
      let branch = level.find((item) => item.path === path && item.children);
      if (!branch) {
        branch = { label: labelize(folder), path, children: [] };
        level.push(branch);
      }
      level = branch.children ?? [];
    }
    level.push({ label: def.title, path: def.type, def });
  }
  return roots;
}

function labelize(segment: string): string {
  if (!segment) return segment;
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

function canConnect(connection: Connection | Edge, edges: Edge[]): boolean {
  if (!connection.source || !connection.target) return false;
  if (connection.source === connection.target) return false;
  if (!connection.sourceHandle || !connectionTargetHandle(connection)) return false;
  const targetHandle = connectionTargetHandle(connection);
  return !edges.some(
    (edge) =>
      edge.target === connection.target &&
      edge.targetHandle === targetHandle &&
      edge.id !== ("id" in connection ? connection.id : undefined)
  );
}

function connectionTargetHandle(connection: Connection | Edge): string | null {
  return connection.targetHandle ?? null;
}

function nodeChangeIsEdit(change: NodeChange<BruhNode>): boolean {
  if (change.type === "select") return false;
  // Measurement omits `resizing`. A finished user resize sets it to false.
  if (change.type === "dimensions") return change.resizing === false;
  // Moves while dragging are true; drag end and arrow-key nudges are false.
  if (change.type === "position") return change.dragging === false;
  return change.type === "remove" || change.type === "add" || change.type === "replace";
}

function edgeChangeIsEdit(change: EdgeChange): boolean {
  return change.type === "remove" || change.type === "add" || change.type === "replace";
}

function toFlowNode(node: GraphNode): BruhNode {
  const fromNode = finiteHeight(node.height);
  const fromStyle = finiteHeight(node.style?.height);
  const saved =
    fromNode === undefined ? fromStyle : fromStyle === undefined ? fromNode : Math.max(fromNode, fromStyle);
  const min = minNodeHeight({
    inputs: node.data.inputs,
    outputs: node.data.outputs,
    fields: getNodeDef(node.data.liteType)?.fields ?? [],
  });
  const height = Math.max(saved ?? min, min);
  return {
    id: node.id,
    type: "bruh",
    position: node.position,
    width: node.width,
    height,
    style: {
      width: node.style?.width as number | undefined,
      height,
    },
    data: node.data,
  };
}

function finiteHeight(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function fromFlowNode(node: BruhNode): GraphNode {
  return {
    id: node.id,
    position: node.position,
    width: node.width,
    height: node.height,
    measured: node.measured,
    style: { width: node.style?.width, height: node.style?.height },
    data: node.data,
  };
}

function toFlowEdge(edge: GraphEdge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    data: asEdgeData(edge.data),
    style: { stroke: "#646cff", strokeWidth: 2 },
  };
}

function fromFlowEdge(edge: Edge): GraphEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    data: edge.data,
  };
}

function asEdgeData(data: unknown): Record<string, unknown> | undefined {
  if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  return undefined;
}

function messageOf(err: unknown, fallback: string): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string" && err.message.trim()) {
    return err.message;
  }
  return fallback;
}
