import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Channel Points event configurations
 * Events related to channel point rewards and redemptions
 */
const channelPointsEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.channel_points_automatic_reward_redemption.add",
    title: "Automatic Reward Redemption",
    description: "Fires when an automatic channel points reward is redeemed",
    category: "twitch/channel_points/automatic_redemption",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
  {
    eventType: "channel.channel_points_custom_reward.add",
    title: "Custom Reward Add",
    description: "Fires when a custom channel points reward is created",
    category: "twitch/channel_points/reward_add",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "channel.channel_points_custom_reward.update",
    title: "Custom Reward Update",
    description: "Fires when a custom channel points reward is updated",
    category: "twitch/channel_points/reward_update",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "channel.channel_points_custom_reward.remove",
    title: "Custom Reward Remove",
    description: "Fires when a custom channel points reward is removed",
    category: "twitch/channel_points/reward_remove",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "channel.channel_points_custom_reward_redemption.add",
    title: "Reward Redemption",
    description: "Fires when a custom channel points reward is redeemed",
    category: "twitch/channel_points/redemption_add",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
  {
    eventType: "channel.channel_points_custom_reward_redemption.update",
    title: "Redemption Update",
    description: "Fires when a reward redemption is fulfilled or cancelled",
    category: "twitch/channel_points/redemption_update",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
];

export function register() {
  registerEventNodes(channelPointsEvents);
}
