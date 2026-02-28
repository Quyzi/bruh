import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Shield Mode event configurations
 * Events related to Shield Mode
 */
const shieldModeEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.shield_mode.begin",
    title: "Shield Mode Begin",
    description: "Fires when Shield Mode is activated",
    category: "twitch/shield_mode/begin",
  },
  {
    eventType: "channel.shield_mode.end",
    title: "Shield Mode End",
    description: "Fires when Shield Mode is deactivated",
    category: "twitch/shield_mode/end",
  },
];

export function register() {
  registerEventNodes(shieldModeEvents);
}
