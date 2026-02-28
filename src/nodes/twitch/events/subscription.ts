import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Subscription event configurations
 * Events related to channel subscriptions
 */
const subscriptionEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.subscribe",
    title: "Subscribe",
    description: "Fires when a user subscribes to the channel",
    category: "twitch/subscription/subscribe",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
      { name: "tier", type: "string" },
      { name: "gift", type: "boolean" },
    ],
  },
  {
    eventType: "channel.subscription.end",
    title: "Subscription End",
    description: "Fires when a user's subscription ends",
    category: "twitch/subscription/end",
  },
  {
    eventType: "channel.subscription.gift",
    title: "Subscription Gift",
    description: "Fires when a user gifts subscriptions",
    category: "twitch/subscription/gift",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
      { name: "tier", type: "string" },
      { name: "total", type: "number" },
    ],
  },
  {
    eventType: "channel.subscription.message",
    title: "Subscription Message",
    description: "Fires when a user sends a resub message",
    category: "twitch/subscription/message",
  },
];

export function register() {
  registerEventNodes(subscriptionEvents);
}
