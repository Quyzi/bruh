/** A port on a workflow node. Slot index is the array index. */
export interface PortDef {
  name: string;
  type: string;
  /** LiteGraph keys on this port other than name, type, and link ids. */
  rest?: Record<string, unknown>;
}

export type FieldKind = "text" | "textarea" | "combo";

export type ComboSource = "scripts" | "agents" | "templates";

export interface FieldDef {
  kind: FieldKind;
  /** Key in the node's `properties` object. Also the widgets_values index order. */
  key: string;
  label: string;
  options?: ComboSource;
  rows?: number;
}

/** Static description of one LiteGraph node type. `type` is the string Rust matches. */
export interface NodeDef {
  type: string;
  title: string;
  description: string;
  inputs: PortDef[];
  outputs: PortDef[];
  fields: FieldDef[];
  properties: Record<string, string>;
  width: number;
  height: number;
}

/** Data stored on a React Flow node. The on-disk form is produced by litegraphDoc. */
export interface FlowNodeData extends Record<string, unknown> {
  liteType: string;
  title: string;
  properties: Record<string, unknown>;
  inputs: PortDef[];
  outputs: PortDef[];
  /** LiteGraph node keys we do not interpret (flags, color, mode, …). */
  rest: Record<string, unknown>;
  /** New combo nodes may take the first loaded option once. */
  autoPick?: boolean;
}

export interface GraphNode {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  style?: { width?: unknown; height?: unknown };
  data: FlowNodeData;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: unknown;
}

export interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Original document minus nodes, links, and the last-id counters. */
  shell: Record<string, unknown>;
  lastNodeId: number;
  lastLinkId: number;
}
