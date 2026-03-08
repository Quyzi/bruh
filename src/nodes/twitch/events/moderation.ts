import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Moderation event configurations
 * Events related to channel moderation actions
 */
const moderationEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.moderate",
    title: "Moderate",
    description: "Fires when a moderation action is taken",
    category: "twitch/moderation/moderate",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
  {
    eventType: "channel.moderator.add",
    title: "Moderator Add",
    description: "Fires when a user is added as a moderator",
    category: "twitch/moderation/moderator_add",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
  {
    eventType: "channel.moderator.remove",
    title: "Moderator Remove",
    description: "Fires when a user is removed as a moderator",
    category: "twitch/moderation/moderator_remove",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
];

export function register() {
  registerEventNodes(moderationEvents);
}
