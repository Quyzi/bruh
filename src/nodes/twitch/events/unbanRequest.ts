import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Unban Request event configurations
 * Events related to unban requests
 */
const unbanRequestEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.unban_request.create",
    title: "Unban Request Create",
    description: "Fires when an unban request is submitted",
    category: "twitch/unban_request/create",
  },
  {
    eventType: "channel.unban_request.resolve",
    title: "Unban Request Resolve",
    description: "Fires when an unban request is approved or denied",
    category: "twitch/unban_request/resolve",
  },
];

export function register() {
  registerEventNodes(unbanRequestEvents);
}
