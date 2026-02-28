import { createSignal, createEffect, For, Show, onMount, onCleanup } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { getSetupStatus, loadChannels, validateTwitchToken } from "../lib/tauri";
import { twitchUsername, setTwitchUsername } from "../lib/authStore";
import {
  chatLogForChannel,
  getChannelCountSignal,
  getChatLog,
  getChannels,
  setChannelsList,
} from "../lib/dashboardChatStore";

interface LogPayload {
  level: number;
  target: string;
  message: string;
  fields: Record<string, string>;
}

interface LogEntry {
  id: number;
  timestamp: string;
  level: number;
  target: string;
  message: string;
  fields: Record<string, string>;
}

interface LogTab {
  id: string;
  label: string;
}

interface StatusBarProps {
  expanded: boolean;
  onToggle: () => void;
}

const levelColors: Record<number, string> = {
  1: "text-text-tertiary",   // Trace
  2: "text-text-secondary",  // Debug
  3: "text-text-primary",    // Info
  4: "text-warning",         // Warn
  5: "text-error",           // Error
};

const levelNames: Record<number, string> = {
  1: "TRACE",
  2: "DEBUG",
  3: "INFO",
  4: "WARN",
  5: "ERROR",
};

const BACKLOG_OPTIONS = [50, 100, 250, 500, 1000];
const LEVEL_OPTIONS = [
  { value: 0, label: "ALL" },
  { value: 1, label: "TRACE" },
  { value: 2, label: "DEBUG" },
  { value: 3, label: "INFO" },
  { value: 4, label: "WARN" },
  { value: 5, label: "ERROR" },
];

type AuthStatus = "red" | "yellow" | "green";

const authStatusColors: Record<AuthStatus, string> = {
  red: "bg-error",
  yellow: "bg-warning",
  green: "bg-success",
};

const EXPANDED_HEIGHT_MIN = 80;
const EXPANDED_HEIGHT_MAX = 480;
const EXPANDED_HEIGHT_DEFAULT = 144; // matches h-36 (9rem)

export function StatusBar(props: StatusBarProps) {
  const [activeLogTab, setActiveLogTab] = createSignal("app");
  const [logs, setLogs] = createSignal<LogEntry[]>([]);
  const [backlogLength, setBacklogLength] = createSignal(100);
  const [minLevel, setMinLevel] = createSignal(3); // Default to INFO
  const [authStatus, setAuthStatus] = createSignal<AuthStatus>("red");
  const [expandedHeight, setExpandedHeight] = createSignal(EXPANDED_HEIGHT_DEFAULT);
  const [isResizing, setIsResizing] = createSignal(false);
  let logId = 0;
  let logContainerRef: HTMLDivElement | undefined;
  let resizeStartY = 0;
  let resizeStartHeight = 0;

  const filteredLogs = () => logs().filter((log) => log.level >= minLevel());

  const chatLog = getChatLog();
  const channels = getChannels();
  const channelCountSignal = getChannelCountSignal();

  const logTabs = () => [
    { id: "app", label: "App Logs" },
    ...channels().map((ch) => ({ id: `channel-${ch}`, label: `#${ch}` })),
  ];

  // Check auth status on mount
  const checkAuthStatus = async () => {
    try {
      const status = await getSetupStatus();
      
      if (!status.credentialsConfigured) {
        setAuthStatus("red");
        setTwitchUsername(null);
        return;
      }

      if (!status.userAuthorized) {
        setAuthStatus("yellow");
        setTwitchUsername(null);
        return;
      }

      // Single validation path: only StatusBar calls this, store is shared with SetupView
      try {
        const result = await validateTwitchToken();
        if (result.success) {
          setAuthStatus("green");
          setTwitchUsername(result.username ?? null);
        } else {
          setAuthStatus("yellow");
          setTwitchUsername(null);
        }
      } catch {
        setAuthStatus("yellow");
        setTwitchUsername(null);
      }
    } catch {
      setAuthStatus("red");
      setTwitchUsername(null);
    }
  };

  // Auto-scroll to bottom when new logs arrive
  createEffect(() => {
    logs(); // Subscribe to logs changes
    if (logContainerRef) {
      logContainerRef.scrollTop = logContainerRef.scrollHeight;
    }
  });

  onMount(async () => {
    // Check auth status
    await checkAuthStatus();

    loadChannels()
      .then((list) => setChannelsList(list.map((c) => c.login)))
      .catch(() => {});

    // Listen for log events
    const unlisten = await listen<LogPayload>("tracing://log", (event) => {
      const { level, target, message, fields } = event.payload;
      const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
      const maxLogs = backlogLength();

      setLogs((prev) => [
        ...prev.slice(-(maxLogs - 1)),
        {
          id: logId++,
          timestamp,
          level,
          target,
          message,
          fields,
        },
      ]);
    });

    // Periodically check auth status (every 5 minutes, aligned with backend token refresh)
    const authCheckInterval = setInterval(checkAuthStatus, 5 * 60 * 1000);

    onCleanup(() => {
      unlisten();
      clearInterval(authCheckInterval);
    });
  });

  const handleBacklogChange = (newLength: number) => {
    setBacklogLength(newLength);
    setLogs((prev) => prev.slice(-newLength));
  };

  const onResizeHandleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    resizeStartY = e.clientY;
    resizeStartHeight = expandedHeight();
    setIsResizing(true);
    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = resizeStartY - moveEvent.clientY;
      const next = Math.round(resizeStartHeight + delta);
      setExpandedHeight(Math.max(EXPANDED_HEIGHT_MIN, Math.min(EXPANDED_HEIGHT_MAX, next)));
    };
    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const statusLineHeight = 32;
  const totalHeight = () =>
    props.expanded ? statusLineHeight + expandedHeight() : statusLineHeight;

  return (
    <div
      class="bg-bg-secondary border-t border-border flex flex-col overflow-hidden flex-shrink-0"
      classList={{
        "transition-[height] duration-200": !isResizing(),
      }}
      style={
        props.expanded
          ? { height: `${totalHeight()}px` }
          : { height: `${statusLineHeight}px` }
      }
    >
      <Show when={props.expanded}>
        <div
          role="separator"
          aria-label="Resize status bar"
          class="h-1 flex-shrink-0 cursor-ns-resize border-b border-border bg-bg-tertiary hover:bg-accent/20 transition-colors select-none"
          onMouseDown={onResizeHandleMouseDown}
        />
      </Show>
      <div class="flex items-center justify-between h-8 min-h-8 px-4 flex-shrink-0">
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-1.5 text-xs">
            <span class="text-text-secondary">Status:</span>
            <span
              class={`w-2 h-2 rounded-full ${authStatusColors[authStatus()]}`}
              title={
                authStatus() === "red"
                  ? "Not configured"
                  : authStatus() === "yellow"
                  ? "Configured but not working"
                  : "Connected"
              }
            />
            <Show when={twitchUsername()}>
              <span class="text-text-primary">{twitchUsername()}</span>
            </Show>
            <Show when={!twitchUsername() && authStatus() === "red"}>
              <span class="text-text-tertiary">Not configured</span>
            </Show>
            <Show when={!twitchUsername() && authStatus() === "yellow"}>
              <span class="text-text-tertiary">Not authorized</span>
            </Show>
          </div>
          <div class="flex items-center gap-1 text-xs">
            <span class="text-text-secondary">Messages:</span>
            <span class="text-text-primary">{chatLog().length}</span>
          </div>
          <div class="flex items-center gap-1 text-xs">
            <span class="text-text-secondary">Channels:</span>
            <span class="text-text-primary">{channelCountSignal()}</span>
          </div>
        </div>
        <button
          class="p-1 rounded text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-all cursor-pointer"
          onClick={props.onToggle}
          title={props.expanded ? "Collapse" : "Expand"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            class={`transition-transform duration-200 ${props.expanded ? "rotate-180" : ""}`}
          >
            <path
              d="M4 10L8 6L12 10"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <Show when={props.expanded}>
        <div class="flex-1 flex flex-col overflow-hidden border-t border-border min-h-0">
          <div class="flex items-center gap-1 px-4 py-0 bg-bg-tertiary border-b border-border">
            <div class="relative mr-1">
              <select
                class="appearance-none text-xs bg-bg-secondary text-text-secondary border border-border rounded pl-1.5 pr-5 py-0.5 cursor-pointer hover:border-text-tertiary focus:outline-none focus:border-accent"
                value={backlogLength()}
                onChange={(e) => handleBacklogChange(Number(e.target.value))}
              >
                <For each={BACKLOG_OPTIONS}>
                  {(opt) => <option value={opt}>{opt}</option>}
                </For>
              </select>
              <svg
                class="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-text-tertiary"
                width="10"
                height="10"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M4 6L8 10L12 6"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <div class="relative mr-2">
              <select
                class="appearance-none text-xs bg-bg-secondary text-text-secondary border border-border rounded pl-1.5 pr-5 py-0.5 cursor-pointer hover:border-text-tertiary focus:outline-none focus:border-accent"
                value={minLevel()}
                onChange={(e) => setMinLevel(Number(e.target.value))}
              >
                <For each={LEVEL_OPTIONS}>
                  {(opt) => <option value={opt.value}>{opt.label}</option>}
                </For>
              </select>
              <svg
                class="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-text-tertiary"
                width="10"
                height="10"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M4 6L8 10L12 6"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
            <For each={logTabs()}>
              {(tab) => (
                <button
                  class={`px-2 py-1 rounded text-xs transition-all cursor-pointer ${
                    activeLogTab() === tab.id
                      ? "bg-bg-secondary text-accent"
                      : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                  }`}
                  onClick={() => setActiveLogTab(tab.id)}
                >
                  {tab.label}
                </button>
              )}
            </For>
          </div>
          <div ref={logContainerRef} class="flex-1 overflow-auto px-2 py-1 font-mono text-xs leading-relaxed min-h-0">
            <Show when={activeLogTab() === "app"}>
              <For each={filteredLogs()}>
                {(log) => (
                  <div class={levelColors[log.level]}>
                    <span class="text-text-tertiary mr-2">[{log.timestamp}]</span>
                    <span class="text-text-secondary mr-1">{levelNames[log.level]}</span>
                    <span class="text-text-secondary mr-1">{log.target}</span>
                    <Show when={Object.keys(log.fields).length > 0}>
                      <span class="text-text-tertiary mr-1">
                        {Object.entries(log.fields)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(" ")}
                      </span>
                    </Show>
                    <span>{log.message}</span>
                  </div>
                )}
              </For>
              <Show when={filteredLogs().length === 0}>
                <div class="text-text-tertiary">
                  {logs().length === 0 ? "No logs yet..." : "No logs match the current filter"}
                </div>
              </Show>
            </Show>
            <Show when={activeLogTab() !== "app"}>
              {(() => {
                const tabId = activeLogTab();
                if (!tabId.startsWith("channel-")) return null;
                const channel = tabId.slice("channel-".length);
                const entries = [...chatLogForChannel(channel)].reverse();
                const formatTime = (timestamp: string) => {
                  const ms = Number(timestamp);
                  if (!Number.isNaN(ms)) {
                    return new Date(ms).toLocaleTimeString("en-US", {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    });
                  }
                  return timestamp;
                };
                const isValidHexColor = (s: string) =>
                  /^#[0-9A-Fa-f]{6}$/.test(s) || /^#[0-9A-Fa-f]{3}$/.test(s);
                return entries.length === 0 ? (
                  <div class="text-text-secondary">
                    No chat messages for #{channel} yet.
                  </div>
                ) : (
                  <For each={entries}>
                    {(entry) => (
                      <div class="text-text-primary">
                        <span class="text-text-tertiary mr-2">
                          [{formatTime(entry.timestamp)}]
                        </span>
                        <span
                          class="mr-1"
                          classList={{ "text-text-secondary": !entry.color || !isValidHexColor(entry.color) }}
                          style={
                            entry.color && isValidHexColor(entry.color)
                              ? { color: entry.color }
                              : undefined
                          }
                        >
                          {entry.username}:
                        </span>
                        <span>{entry.message}</span>
                      </div>
                    )}
                  </For>
                );
              })()}
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
