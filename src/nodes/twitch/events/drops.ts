import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Drops event configurations
 * Events related to Twitch Drops
 */
const dropsEvents: TwitchEventConfig[] = [
  {
    eventType: "drop.entitlement.grant",
    title: "Drop Entitlement Grant",
    description: "Fires when a user earns a Drop entitlement",
    category: "twitch/drops/entitlement_grant",
  },
];

export function register() {
  registerEventNodes(dropsEvents);
}
