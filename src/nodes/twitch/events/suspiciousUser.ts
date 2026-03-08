import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Suspicious User event configurations
 * Events related to suspicious user detection
 */
const suspiciousUserEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.suspicious_user.message",
    title: "Suspicious User Message",
    description: "Fires when a suspicious user sends a message",
    category: "twitch/suspicious_user/message",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
  {
    eventType: "channel.suspicious_user.update",
    title: "Suspicious User Update",
    description: "Fires when a suspicious user's status is updated",
    category: "twitch/suspicious_user/update",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
];

export function register() {
  registerEventNodes(suspiciousUserEvents);
}
