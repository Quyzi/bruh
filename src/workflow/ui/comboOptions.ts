import { listAiAgents, listOverlayTemplates, listScripts } from "../../lib/tauri";
import type { ComboSource } from "../types";

const cache = new Map<ComboSource, Promise<string[]>>();

export function loadComboOptions(source: ComboSource): Promise<string[]> {
  const existing = cache.get(source);
  if (existing) return existing;
  const pending = fetchOptions(source).catch(() => {
    cache.delete(source);
    return [];
  });
  cache.set(source, pending);
  return pending;
}

async function fetchOptions(source: ComboSource): Promise<string[]> {
  const raw =
    source === "scripts"
      ? await listScripts()
      : source === "templates"
        ? await listOverlayTemplates()
        : (await listAiAgents()).map((agent) => agent.name);
  return uniqueNames(raw);
}

function uniqueNames(raw: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const name of raw) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}
