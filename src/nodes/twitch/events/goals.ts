import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Goals event configurations
 * Events related to channel goals
 */
const goalsEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.goal.begin",
    title: "Goal Begin",
    description: "Fires when a channel goal is created",
    category: "twitch/goals/begin",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "channel.goal.progress",
    title: "Goal Progress",
    description: "Fires when progress is made on a channel goal",
    category: "twitch/goals/progress",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "channel.goal.end",
    title: "Goal End",
    description: "Fires when a channel goal ends",
    category: "twitch/goals/end",
    outputs: [{ name: "channel", type: "string" }],
  },
];

export function register() {
  registerEventNodes(goalsEvents);
}
