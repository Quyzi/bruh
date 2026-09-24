import type { NodeDef } from "../../workflow/types";

/**
 * Optional data output for an event node (e.g. user, tier).
 */
export interface TwitchEventOutput {
  name: string;
  type: string;
}

/**
 * Configuration for creating a Twitch event node.
 * `category` is the workflow node type string the runtime stores.
 */
export interface TwitchEventConfig {
  /** The EventSub event type (e.g., "channel.follow") */
  eventType: string;
  /** Human-readable title for the node */
  title: string;
  /** Description of what this event does */
  description: string;
  /** Node type path (e.g., "twitch/channel/follow") */
  category: string;
  /** Optional data outputs filled by the backend when the event fires */
  outputs?: TwitchEventOutput[];
}

const eventDefs: NodeDef[] = [];

export function resetEventNodeDefs(): void {
  eventDefs.length = 0;
}

export function getEventNodeDefs(): NodeDef[] {
  return eventDefs;
}

/**
 * Creates a catalog entry for one Twitch event node.
 * Slot order follows `config.outputs` because the runtime injects values by slot index.
 */
export function createTwitchEventNode(config: TwitchEventConfig) {
  const outputs = (config.outputs ?? []).map((output) => ({
    name: output.name,
    type: output.type,
  }));
  const def: NodeDef = {
    type: config.category,
    title: config.title,
    description: config.description,
    inputs: [],
    outputs,
    fields: [],
    properties: { eventType: config.eventType },
    width: 220,
    height: Math.max(64, 40 + outputs.length * 22),
  };

  return {
    register: () => {
      eventDefs.push(def);
    },
  };
}

/**
 * Helper to register multiple event nodes at once
 */
export function registerEventNodes(configs: TwitchEventConfig[]) {
  for (const config of configs) {
    createTwitchEventNode(config).register();
  }
}
