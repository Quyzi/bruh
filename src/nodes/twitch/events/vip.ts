import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * VIP event configurations
 * Events related to VIP status changes
 */
const vipEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.vip.add",
    title: "VIP Add",
    description: "Fires when a user is added as a VIP",
    category: "twitch/vip/add",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
  {
    eventType: "channel.vip.remove",
    title: "VIP Remove",
    description: "Fires when a user's VIP status is removed",
    category: "twitch/vip/remove",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
];

export function register() {
  registerEventNodes(vipEvents);
}
