import { TwitchEventConfig, registerEventNodes } from "../eventNodeFactory";

/**
 * Channel chat event configurations
 * Events related to chat messages and chat room management
 */
const chatEvents: TwitchEventConfig[] = [
  {
    eventType: "channel.chat.clear",
    title: "Chat Clear",
    description: "Fires when chat is cleared by a moderator",
    category: "twitch/chat/clear",
  },
  {
    eventType: "channel.chat.clear_user_messages",
    title: "Chat Clear User Messages",
    description: "Fires when a specific user's messages are cleared",
    category: "twitch/chat/clear_user_messages",
  },
  {
    eventType: "channel.chat.message",
    title: "Chat Message",
    description: "Fires when a chat message is sent in the channel",
    category: "twitch/chat/message",
  },
  {
    eventType: "channel.chat.message_delete",
    title: "Chat Message Delete",
    description: "Fires when a chat message is deleted",
    category: "twitch/chat/message_delete",
  },
  {
    eventType: "channel.chat.notification",
    title: "Chat Notification",
    description: "Fires for chat notifications (subs, raids, etc.)",
    category: "twitch/chat/notification",
  },
  {
    eventType: "channel.chat.settings_update",
    title: "Chat Settings Update",
    description: "Fires when chat room settings are updated",
    category: "twitch/chat/settings_update",
  },
  {
    eventType: "channel.chat.user_message_hold",
    title: "Chat User Message Hold",
    description: "Fires when a user's message is held for review",
    category: "twitch/chat/user_message_hold",
  },
  {
    eventType: "channel.chat.user_message_update",
    title: "Chat User Message Update",
    description: "Fires when a held user message is approved or denied",
    category: "twitch/chat/user_message_update",
  },
];

export function register() {
  registerEventNodes(chatEvents);
}
