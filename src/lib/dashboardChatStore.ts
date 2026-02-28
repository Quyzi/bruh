import { createSignal } from "solid-js";

const MAX_CHAT_LOG_SIZE = 200;

export interface ChatLogEntry {
  id: string;
  channel: string;
  username: string;
  message: string;
  timestamp: string;
  messageId?: string;
  userId?: string;
  /** Twitch user's chosen name color (hex e.g. "#00FF7F"). Used when rendering the username. */
  color?: string;
}

const [chatLog, setChatLog] = createSignal<ChatLogEntry[]>([]);
const [channels, setChannels] = createSignal<string[]>([]);
const [configuredChannelCount, setConfiguredChannelCount] = createSignal(0);

export function getChatLog() {
  return chatLog;
}

export function getChannels() {
  return channels;
}

export function addChatEntry(entry: Omit<ChatLogEntry, "id"> & { id?: string }) {
  const id = entry.id ?? `${entry.channel}-${entry.timestamp}`;
  setChatLog((prev) => {
    if (entry.messageId != null && entry.messageId !== "") {
      const duplicate = prev.some(
        (e) => e.messageId === entry.messageId && e.channel === entry.channel
      );
      if (duplicate) return prev;
    }
    const next = [
      { ...entry, id },
      ...prev,
    ];
    return next.slice(0, MAX_CHAT_LOG_SIZE);
  });
  setChannels((prev) => {
    const set = new Set(prev);
    set.add(entry.channel);
    return [...set];
  });
}

export function setChannelsList(logins: string[]) {
  setConfiguredChannelCount(logins.length);
  setChannels((prev) => {
    const set = new Set(logins);
    prev.forEach((ch) => set.add(ch));
    return [...set];
  });
}

export function removeChatEntry(id: string) {
  setChatLog((prev) => prev.filter((e) => e.id !== id));
}

export function messageCount() {
  return chatLog().length;
}

export function channelCount() {
  return configuredChannelCount();
}

/** Returns the configured channel count signal for reactive use in components. */
export function getChannelCountSignal() {
  return configuredChannelCount;
}

export function chatLogForChannel(channel: string) {
  return chatLog().filter((e) => e.channel === channel);
}
