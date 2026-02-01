import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Conduit event configurations
 * Events related to Conduit management
 */
const conduitEvents: TwitchEventConfig[] = [
  {
    eventType: "conduit.shard.disabled",
    title: "Conduit Shard Disabled",
    description: "Fires when a Conduit shard is disabled",
    category: "twitch/conduit/shard_disabled",
  },
];

export function register() {
  registerEventNodes(conduitEvents);
}
