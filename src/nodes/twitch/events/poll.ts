import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Poll event configurations
 * Events related to channel polls
 */
const pollEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.poll.begin",
    title: "Poll Begin",
    description: "Fires when a poll starts",
    category: "twitch/poll/begin",
  },
  {
    eventType: "channel.poll.progress",
    title: "Poll Progress",
    description: "Fires when votes are cast in a poll",
    category: "twitch/poll/progress",
  },
  {
    eventType: "channel.poll.end",
    title: "Poll End",
    description: "Fires when a poll ends",
    category: "twitch/poll/end",
  },
];

export function register() {
  registerEventNodes(pollEvents);
}
