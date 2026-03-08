import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Core channel event configurations
 * These are the fundamental channel events like bans, follows, and updates
 */
const channelEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.update",
    title: "Channel Update",
    description: "Fires when channel information is updated (title, category, etc.)",
    category: "twitch/channel/update",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "channel.follow",
    title: "Channel Follow",
    description: "Fires when a user follows the channel",
    category: "twitch/channel/follow",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
  {
    eventType: "channel.ban",
    title: "Channel Ban",
    description: "Fires when a user is banned from the channel",
    category: "twitch/channel/ban",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
  {
    eventType: "channel.unban",
    title: "Channel Unban",
    description: "Fires when a user is unbanned from the channel",
    category: "twitch/channel/unban",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
  {
    eventType: "channel.ad_break.begin",
    title: "Ad Break Begin",
    description: "Fires when an ad break begins on the channel",
    category: "twitch/channel/ad_break_begin",
    outputs: [{ name: "channel", type: "string" }],
  },
];

export function register() {
  registerEventNodes(channelEvents);
}
