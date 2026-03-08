import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Warning event configurations
 * Events related to user warnings
 */
const warningEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.warning.send",
    title: "Warning Send",
    description: "Fires when a warning is sent to a user",
    category: "twitch/warning/send",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
  {
    eventType: "channel.warning.acknowledge",
    title: "Warning Acknowledge",
    description: "Fires when a user acknowledges a warning",
    category: "twitch/warning/acknowledge",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
];

export function register() {
  registerEventNodes(warningEvents);
}
