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
  },
  {
    eventType: "stream.offline",
    title: "Stream Offline",
    description: "Fires when the stream goes offline",
    category: "twitch/stream/offline",
  },
];

export function register() {
  registerEventNodes(streamEvents);
}
