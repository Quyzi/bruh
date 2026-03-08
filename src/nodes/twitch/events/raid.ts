import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Raid event configurations
 * Events related to channel raids
 */
const raidEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.raid",
    title: "Raid",
    description: "Fires when a channel raids or is raided",
    category: "twitch/raid/raid",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
];

export function register() {
  registerEventNodes(raidEvents);
}
