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
  },
  {
    eventType: "channel.vip.remove",
    title: "VIP Remove",
    description: "Fires when a user's VIP status is removed",
    category: "twitch/vip/remove",
  },
];

export function register() {
  registerEventNodes(vipEvents);
}
