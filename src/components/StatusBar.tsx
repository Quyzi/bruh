import { createSignal, For, Show } from "solid-js";

interface LogTab {
  id: string;
  label: string;
}

interface StatusBarProps {
  expanded: boolean;
  onToggle: () => void;
}

export function StatusBar(props: StatusBarProps) {
  const [activeLogTab, setActiveLogTab] = createSignal("app");

  const logTabs: LogTab[] = [
    { id: "app", label: "App Logs" },
    { id: "channel-placeholder", label: "#channel" },
  ];

  return (
    <div
      class={`bg-bg-secondary border-t border-border flex flex-col overflow-hidden transition-[height] duration-200 ${
        props.expanded ? "h-58" : "h-8"
      }`}
    >
      <div class="flex items-center justify-between h-8 min-h-8 px-4">
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-1 text-xs">
            <span class="text-text-secondary">Status:</span>
            <span class="text-success">Ready</span>
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
          <div class="flex gap-1 px-4 py-2 bg-bg-tertiary border-b border-border">
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
          <div class="flex-1 overflow-auto p-2 font-mono text-xs leading-relaxed">
            <Show when={activeLogTab() === "app"}>
              <div class="text-text-secondary">
                <span class="mr-2">[00:00:00]</span>
                <span class="text-text-primary">Application started</span>
              </div>
              <div class="text-text-secondary">
                <span class="mr-2">[00:00:00]</span>
                <span class="text-text-primary">Waiting for configuration...</span>
              </div>
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
