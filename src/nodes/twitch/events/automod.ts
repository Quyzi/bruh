import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Automod event configurations
 * These events fire when AutoMod holds or updates messages for review
 */
const automodEvents: TwitchEventConfig[] = [
  {
    eventType: "automod.message.hold",
    title: "AutoMod Message Hold",
    description: "Fires when AutoMod holds a message for review",
    category: "twitch/automod/message_hold",
  },
  {
    eventType: "automod.message.update",
    title: "AutoMod Message Update",
    description: "Fires when a held AutoMod message is approved or denied",
    category: "twitch/automod/message_update",
  },
  {
    eventType: "automod.settings.update",
    title: "AutoMod Settings Update",
    description: "Fires when AutoMod settings are updated",
    category: "twitch/automod/settings_update",
  },
  {
    eventType: "automod.terms.update",
    title: "AutoMod Terms Update",
    description: "Fires when AutoMod blocked/permitted terms are updated",
    category: "twitch/automod/terms_update",
  },
];

export function register() {
  registerEventNodes(automodEvents);
}
