import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Stream event configurations
 * Events related to stream status changes
 */
const streamEvents: TwitchEventConfig[] = [
  {
    eventType: "stream.online",
    title: "Stream Online",
    description: "Fires when the stream goes live",
    category: "twitch/stream/online",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "stream.offline",
    title: "Stream Offline",
    description: "Fires when the stream goes offline",
    category: "twitch/stream/offline",
    outputs: [{ name: "channel", type: "string" }],
  },
];

export function register() {
  registerEventNodes(streamEvents);
}
