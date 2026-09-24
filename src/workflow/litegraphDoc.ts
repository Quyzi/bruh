import { getNodeDef } from "./catalog";
import type { FlowNodeData, GraphEdge, GraphNode, GraphState, PortDef } from "./types";

const NODE_OWNED = new Set([
  "id",
  "type",
  "pos",
  "size",
  "properties",
  "inputs",
  "outputs",
  "title",
]);

/**
 * Reads a LiteGraph workflow document into editor nodes and edges.
 * Unknown graph keys (including `groups`) stay on `shell` and are written back by {@link saveLiteGraph}.
 */
export function loadLiteGraph(doc: unknown): GraphState {
  const root = asRecord(doc);
  const shell: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(root)) {
    if (key === "nodes" || key === "links" || key === "last_node_id" || key === "last_link_id") {
      continue;
    }
    shell[key] = value;
  }

  const nodes: GraphNode[] = [];
  const nodeList = Array.isArray(root.nodes) ? root.nodes : [];
  for (const raw of nodeList) {
    const node = nodeFromLite(raw);
    if (node) nodes.push(node);
  }

  const edges: GraphEdge[] = [];
  const linkList = Array.isArray(root.links) ? root.links : [];
  for (const raw of linkList) {
    const edge = edgeFromLite(raw);
    if (edge) edges.push(edge);
  }

  const lastNodeId = Math.max(numeric(root.last_node_id), ...nodes.map((node) => numeric(node.id)));
  const lastLinkId = Math.max(numeric(root.last_link_id), ...edges.map((edge) => numeric(edge.id)));

  return { nodes, edges, shell, lastNodeId, lastLinkId };
}

/**
 * Writes editor state back to a LiteGraph document the Rust runtime already parses.
 * Link arrays are `[id, originId, originSlot, targetId, targetSlot, type, ...]`.
 * Nodes with catalog fields also get `widgets_values` in field order (Rust reads that as a fallback).
 */
export function saveLiteGraph(state: GraphState): Record<string, unknown> {
  let lastLinkId = state.lastLinkId;
  const links: unknown[][] = [];
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number[]>();

  for (const edge of state.edges) {
    const originId = integerId(edge.source);
    const targetId = integerId(edge.target);
    if (originId === null || targetId === null) continue;
    const originSlot = slotIndex(edge.sourceHandle, "out");
    const targetSlot = slotIndex(edge.targetHandle, "in");
    let linkId = integerId(edge.id);
    if (linkId === null) {
      lastLinkId += 1;
      linkId = lastLinkId;
    }
    lastLinkId = Math.max(lastLinkId, linkId);

    const meta = asRecord(edge.data);
    const tail = Array.isArray(meta.tail) ? meta.tail : [];
    const origin = state.nodes.find((node) => node.id === edge.source);
    const portType =
      meta.linkType ??
      origin?.data.outputs[originSlot]?.type ??
      "string";
    links.push([linkId, originId, originSlot, targetId, targetSlot, portType, ...tail]);

    incoming.set(`${targetId}:${targetSlot}`, linkId);
    const outKey = `${originId}:${originSlot}`;
    const list = outgoing.get(outKey);
    if (list) list.push(linkId);
    else outgoing.set(outKey, [linkId]);
  }

  let lastNodeId = state.lastNodeId;
  const nodes = state.nodes.flatMap((node, index) => {
    const id = integerId(node.id);
    if (id === null) return [];
    lastNodeId = Math.max(lastNodeId, id);
    const def = getNodeDef(node.data.liteType);
    const [width, height] = nodeBox(node, def?.width ?? 220, def?.height ?? 80);
    const properties = { ...node.data.properties };
    const out: Record<string, unknown> = {
      ...node.data.rest,
      id,
      type: node.data.liteType,
      pos: [node.position.x, node.position.y],
      size: [width, height],
      title: node.data.title,
      properties,
      inputs: node.data.inputs.map((port, slot) => ({
        ...port.rest,
        name: port.name,
        type: port.type,
        link: incoming.get(`${id}:${slot}`) ?? null,
      })),
      outputs: node.data.outputs.map((port, slot) => {
        const slotLinks = outgoing.get(`${id}:${slot}`) ?? [];
        return {
          ...port.rest,
          name: port.name,
          type: port.type,
          links: slotLinks.length > 0 ? slotLinks : null,
        };
      }),
    };
    if (out.order === undefined) out.order = index;
    if (def && def.fields.length > 0) {
      out.widgets_values = def.fields.map((field) => properties[field.key] ?? "");
    }
    return [out];
  });

  return {
    ...state.shell,
    last_node_id: lastNodeId,
    last_link_id: lastLinkId,
    nodes,
    links,
  };
}

function nodeFromLite(raw: unknown): GraphNode | null {
  const node = asRecord(raw);
  const id = integerId(node.id);
  const liteType = typeof node.type === "string" ? node.type : null;
  if (id === null || !liteType) return null;

  const def = getNodeDef(liteType);
  const properties = asRecord(node.properties);
  const widgets = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  if (def) {
    def.fields.forEach((field, index) => {
      if (properties[field.key] === undefined && widgets[index] !== undefined) {
        properties[field.key] = widgets[index];
      }
      if (properties[field.key] === undefined) {
        properties[field.key] = def.properties[field.key] ?? "";
      }
    });
    for (const [key, value] of Object.entries(def.properties)) {
      if (properties[key] === undefined) properties[key] = value;
    }
  }

  const inputs = portsFrom(node.inputs, def?.inputs ?? []);
  const outputs = portsFrom(node.outputs, def?.outputs ?? []);
  const pos = pair(node.pos) ?? [0, 0];
  const size = pair(node.size) ?? [def?.width ?? 220, def?.height ?? 80];
  const title = typeof node.title === "string" ? node.title : (def?.title ?? liteType);

  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (NODE_OWNED.has(key)) continue;
    if (key === "widgets_values" && def && def.fields.length > 0) continue;
    rest[key] = value;
  }

  const data: FlowNodeData = {
    liteType,
    title,
    properties,
    inputs,
    outputs,
    rest,
  };

  return {
    id: String(id),
    position: { x: pos[0], y: pos[1] },
    width: size[0],
    height: size[1],
    style: { width: size[0], height: size[1] },
    data,
  };
}

function edgeFromLite(raw: unknown): GraphEdge | null {
  if (!Array.isArray(raw) || raw.length < 5) return null;
  const linkId = integerId(raw[0]);
  const originId = integerId(raw[1]);
  const originSlot = integerId(raw[2]);
  const targetId = integerId(raw[3]);
  const targetSlot = integerId(raw[4]);
  if (
    linkId === null ||
    originId === null ||
    originSlot === null ||
    targetId === null ||
    targetSlot === null
  ) {
    return null;
  }
  return {
    id: String(linkId),
    source: String(originId),
    target: String(targetId),
    sourceHandle: `out-${originSlot}`,
    targetHandle: `in-${targetSlot}`,
    data: {
      linkType: raw[5],
      tail: raw.slice(6),
    },
  };
}

function portsFrom(raw: unknown, fallback: PortDef[]): PortDef[] {
  if (!Array.isArray(raw)) return fallback.map((port) => ({ ...port }));
  return raw.map((entry, index) => {
    const rec = asRecord(entry);
    const name = typeof rec.name === "string" ? rec.name : (fallback[index]?.name ?? `slot ${index}`);
    const type = typeof rec.type === "string" ? rec.type : (fallback[index]?.type ?? "string");
    const rest: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rec)) {
      if (key === "name" || key === "type" || key === "link" || key === "links") continue;
      rest[key] = value;
    }
    const port: PortDef = { name, type };
    if (Object.keys(rest).length > 0) port.rest = rest;
    return port;
  });
}

function nodeBox(node: GraphNode, fallbackW: number, fallbackH: number): [number, number] {
  const width = positive(node.width) ?? positive(node.style?.width) ?? positive(node.measured?.width) ?? fallbackW;
  const height = positive(node.height) ?? positive(node.style?.height) ?? positive(node.measured?.height) ?? fallbackH;
  return [width, height];
}

function slotIndex(handle: string | null | undefined, prefix: string): number {
  if (!handle) return 0;
  const head = `${prefix}-`;
  if (!handle.startsWith(head)) return 0;
  const n = Number(handle.slice(head.length));
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

function pair(value: unknown): [number, number] | null {
  if (Array.isArray(value) && value.length >= 2) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  }
  const rec = asRecord(value);
  const x = rec[0] ?? rec.x;
  const y = rec[1] ?? rec.y;
  if (x === undefined || y === undefined) return null;
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
  return [nx, ny];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function integerId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return null;
}

function numeric(value: unknown): number {
  const n = integerId(value);
  return n === null ? 0 : n;
}

function positive(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
