import { registerAllTwitchEvents } from "../nodes/twitch/events";
import { getEventNodeDefs, resetEventNodeDefs } from "../nodes/twitch/eventNodeFactory";
import { builtinNodeDefs } from "./builtins";
import type { NodeDef } from "./types";

const ALLOWED_ROOTS = new Set([
  "ai",
  "database",
  "twitch",
  "script",
  "secrets",
  "utilities",
  "primitives",
  "overlay",
]);

const byType = new Map<string, NodeDef>();
let ready = false;

/** Build the node catalog once. Safe to call from render and from the document adapter. */
export function ensureCatalog(): void {
  if (ready) return;
  ready = true;
  resetEventNodeDefs();
  registerAllTwitchEvents();
  for (const def of [...builtinNodeDefs(), ...getEventNodeDefs()]) {
    if (!byType.has(def.type)) byType.set(def.type, def);
  }
}

export function getNodeDef(type: string): NodeDef | undefined {
  ensureCatalog();
  return byType.get(type);
}

/** Node types shown in the add-node menu, in type-path order. */
export function menuNodeDefs(): NodeDef[] {
  ensureCatalog();
  return [...byType.values()]
    .filter((def) => ALLOWED_ROOTS.has(def.type.split("/")[0] ?? ""))
    .sort((a, b) => a.type.localeCompare(b.type));
}
