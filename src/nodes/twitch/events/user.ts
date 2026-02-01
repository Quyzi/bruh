import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * User event configurations
 * Events related to user authorization and updates
 */
const userEvents: TwitchEventConfig[] = [
  {
    eventType: "user.authorization.grant",
    title: "Authorization Grant",
    description: "Fires when a user grants authorization to your application",
    category: "twitch/user/authorization_grant",
  },
  {
    eventType: "user.authorization.revoke",
    title: "Authorization Revoke",
    description: "Fires when a user revokes authorization from your application",
    category: "twitch/user/authorization_revoke",
  },
  {
    eventType: "user.update",
    title: "User Update",
    description: "Fires when user information is updated",
    category: "twitch/user/update",
  },
  {
    eventType: "user.whisper.message",
    title: "Whisper Message",
    description: "Fires when a whisper is received",
    category: "twitch/user/whisper",
  },
];

export function register() {
  registerEventNodes(userEvents);
}
