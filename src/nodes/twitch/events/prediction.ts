import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Prediction event configurations
 * Events related to channel predictions
 */
const predictionEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.prediction.begin",
    title: "Prediction Begin",
    description: "Fires when a prediction starts",
    category: "twitch/prediction/begin",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "channel.prediction.progress",
    title: "Prediction Progress",
    description: "Fires when users participate in a prediction",
    category: "twitch/prediction/progress",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "channel.prediction.lock",
    title: "Prediction Lock",
    description: "Fires when a prediction is locked",
    category: "twitch/prediction/lock",
    outputs: [{ name: "channel", type: "string" }],
  },
  {
    eventType: "channel.prediction.end",
    title: "Prediction End",
    description: "Fires when a prediction ends",
    category: "twitch/prediction/end",
    outputs: [{ name: "channel", type: "string" }],
  },
];

export function register() {
  registerEventNodes(predictionEvents);
}
