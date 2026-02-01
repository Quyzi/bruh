import { LiteGraph } from "litegraph.js";

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
}

/**
 * Creates a Twitch event node constructor for the given configuration.
 * Each event type gets its own dedicated node for better organization and discoverability.
 */
export function createTwitchEventNode(config: TwitchEventConfig) {
  const nodeConstructor = function (this: any) {
    this.addOutput("event", LiteGraph.EVENT);
    this.properties = { eventType: config.eventType };
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
