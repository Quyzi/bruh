import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Shoutout event configurations
 * Events related to shoutouts
 */
const shoutoutEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.shoutout.create",
    title: "Shoutout Create",
    description: "Fires when a shoutout is sent",
    category: "twitch/shoutout/create",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
  {
    eventType: "channel.shoutout.receive",
    title: "Shoutout Receive",
    description: "Fires when a shoutout is received",
    category: "twitch/shoutout/receive",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
];

export function register() {
  registerEventNodes(shoutoutEvents);
}
