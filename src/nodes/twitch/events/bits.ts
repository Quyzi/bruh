import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Bits and Cheer event configurations
 * Events related to Bits usage and cheering
 */
const bitsEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.cheer",
    title: "Cheer",
    description: "Fires when a user cheers with Bits",
    category: "twitch/bits/cheer",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
  {
    eventType: "channel.bits.use",
    title: "Bits Use",
    description: "Fires when Bits are used in the channel",
    category: "twitch/bits/use",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
];

export function register() {
  registerEventNodes(bitsEvents);
}
