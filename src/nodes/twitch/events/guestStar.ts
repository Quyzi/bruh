import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Guest Star event configurations
 * Events related to Guest Star sessions
 */
const guestStarEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.guest_star_session.begin",
    title: "Guest Star Session Begin",
    description: "Fires when a Guest Star session starts",
    category: "twitch/guest_star/session_begin",
  },
  {
    eventType: "channel.guest_star_session.end",
    title: "Guest Star Session End",
    description: "Fires when a Guest Star session ends",
    category: "twitch/guest_star/session_end",
  },
  {
    eventType: "channel.guest_star_guest.update",
    title: "Guest Star Guest Update",
    description: "Fires when a Guest Star guest's state changes",
    category: "twitch/guest_star/guest_update",
  },
  {
    eventType: "channel.guest_star_settings.update",
    title: "Guest Star Settings Update",
    description: "Fires when Guest Star settings are updated",
    category: "twitch/guest_star/settings_update",
  },
];

export function register() {
  registerEventNodes(guestStarEvents);
}
