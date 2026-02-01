import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Extension event configurations
 * Events related to Twitch Extensions
 */
const extensionEvents: TwitchEventConfig[] = [
  {
    eventType: "extension.bits_transaction.create",
    title: "Extension Bits Transaction",
    description: "Fires when Bits are used in an extension",
    category: "twitch/extension/bits_transaction",
  },
];

export function register() {
  registerEventNodes(extensionEvents);
}
