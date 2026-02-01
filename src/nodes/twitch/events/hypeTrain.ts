import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Hype Train event configurations
 * Events related to Hype Trains
 */
const hypeTrainEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.hype_train.begin",
    title: "Hype Train Begin",
    description: "Fires when a Hype Train starts",
    category: "twitch/hype_train/begin",
  },
  {
    eventType: "channel.hype_train.progress",
    title: "Hype Train Progress",
    description: "Fires when a Hype Train levels up or progresses",
    category: "twitch/hype_train/progress",
  },
  {
    eventType: "channel.hype_train.end",
    title: "Hype Train End",
    description: "Fires when a Hype Train ends",
    category: "twitch/hype_train/end",
  },
];

export function register() {
  registerEventNodes(hypeTrainEvents);
}
