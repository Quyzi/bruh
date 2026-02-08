import { createSignal, createEffect, For, Show, onMount, onCleanup } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { getSetupStatus, validateTwitchToken } from "../lib/tauri";

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

export function StatusBar(props: StatusBarProps) {
  const [activeLogTab, setActiveLogTab] = createSignal("app");
  const [logs, setLogs] = createSignal<LogEntry[]>([]);
  const [backlogLength, setBacklogLength] = createSignal(100);
  const [minLevel, setMinLevel] = createSignal(3); // Default to INFO
  const [authStatus, setAuthStatus] = createSignal<AuthStatus>("red");
  const [twitchUsername, setTwitchUsername] = createSignal<string | null>(null);
  let logId = 0;
  let logContainerRef: HTMLDivElement | undefined;

  const filteredLogs = () => logs().filter((log) => log.level >= minLevel());

  const logTabs: LogTab[] = [
    { id: "app", label: "App Logs" },
    { id: "channel-placeholder", label: "#channel" },
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
      
      // Validate token
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

  return (
    <div
      class={`bg-bg-secondary border-t border-border flex flex-col overflow-hidden transition-[height] duration-200 ${
        props.expanded ? "h-58" : "h-8"
      }`}
    >
      <div class="flex items-center justify-between h-8 min-h-8 px-4">
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
            <span class="text-text-primary">0</span>
          </div>
          <div class="flex items-center gap-1 text-xs">
            <span class="text-text-secondary">Channels:</span>
            <span class="text-text-primary">0</span>
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
        <div class="flex-1 flex flex-col overflow-hidden border-t border-border">
          <div class="flex items-center gap-1 px-4 py-2 bg-bg-tertiary border-b border-border">
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
            <For each={logTabs}>
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
          <div ref={logContainerRef} class="flex-1 overflow-auto p-2 font-mono text-xs leading-relaxed">
            <Show when={activeLogTab() === "app"}>
              <For each={filteredLogs()}>
                {(log) => (
                  <div class={levelColors[log.level]}>
                    <span class="text-text-tertiary mr-2">[{log.timestamp}]</span>
                    <span class="text-text-secondary mr-1">{levelNames[log.level]}</span>
                    <span class="text-text-secondary mr-1">{log.target}:</span>
                    <span>{log.message}</span>
                    <Show when={Object.keys(log.fields).length > 0}>
                      <span class="text-text-tertiary ml-1">
                        {Object.entries(log.fields)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(" ")}
                      </span>
                    </Show>
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
              <div class="text-text-secondary">
                <span class="mr-2">[00:00:00]</span>
                <span class="text-text-primary">No channel connected</span>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
