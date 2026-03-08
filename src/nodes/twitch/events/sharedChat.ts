import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Shared Chat event configurations
 * Events related to shared chat sessions between channels
 */
const sharedChatEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.shared_chat.begin",
    title: "Shared Chat Begin",
    description: "Fires when a shared chat session starts",
    category: "twitch/shared_chat/begin",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "channel.shared_chat.update",
    title: "Shared Chat Update",
    description: "Fires when a shared chat session is updated",
    category: "twitch/shared_chat/update",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "channel.shared_chat.end",
    title: "Shared Chat End",
    description: "Fires when a shared chat session ends",
    category: "twitch/shared_chat/end",
    outputs: [{ name: "channel", type: "string" }],
  },
];

export function register() {
  registerEventNodes(sharedChatEvents);
}
