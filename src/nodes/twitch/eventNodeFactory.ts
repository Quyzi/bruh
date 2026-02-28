import { LiteGraph } from "litegraph.js";

/**
 * Optional data output for an event node (e.g. user, tier).
 */
export interface TwitchEventOutput {
  name: string;
  type: string;
}

/**
 * Configuration for creating a Twitch event node
 */
export interface TwitchEventConfig {
  /** The EventSub event type (e.g., "channel.follow") */
  eventType: string;
  /** Human-readable title for the node */
  title: string;
  /** Description of what this event does */
  description: string;
  /** LiteGraph category path (e.g., "twitch/channel") */
  category: string;
  /** Optional data outputs (e.g. user, tier) filled by the backend when the event fires */
  outputs?: TwitchEventOutput[];
}

/**
 * Creates a Twitch event node constructor for the given configuration.
 * Each event type gets its own dedicated node for better organization and discoverability.
 */
export function createTwitchEventNode(config: TwitchEventConfig) {
  const nodeConstructor = function (this: any) {
    this.properties = { eventType: config.eventType };
    if (config.outputs) {
      for (const output of config.outputs) {
        this.addOutput(output.name, output.type);
      }
    }
  };

  nodeConstructor.prototype.onExecute = function () {
    // Placeholder - will be triggered by actual Twitch EventSub events
  };

  nodeConstructor.title = config.title;
  nodeConstructor.desc = config.description;

  return {
    constructor: nodeConstructor,
    register: () => {
      LiteGraph.registerNodeType(config.category, nodeConstructor as any);
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
