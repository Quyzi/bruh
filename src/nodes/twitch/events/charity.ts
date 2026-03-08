import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Charity event configurations
 * Events related to charity campaigns
 */
const charityEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.charity_campaign.donate",
    title: "Charity Donation",
    description: "Fires when a donation is made to a charity campaign",
    category: "twitch/charity/donate",
    outputs: [
      { name: "channel", type: "string" },
      { name: "user", type: "string" },
    ],
  },
  {
    eventType: "channel.charity_campaign.start",
    title: "Charity Campaign Start",
    description: "Fires when a charity campaign starts",
    category: "twitch/charity/start",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "channel.charity_campaign.progress",
    title: "Charity Campaign Progress",
    description: "Fires when progress is made on a charity campaign",
    category: "twitch/charity/progress",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "channel.charity_campaign.stop",
    title: "Charity Campaign Stop",
    description: "Fires when a charity campaign ends",
    category: "twitch/charity/stop",
    outputs: [{ name: "channel", type: "string" }],
  },
];

export function register() {
  registerEventNodes(charityEvents);
}
