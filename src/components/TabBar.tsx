import { For } from "solid-js";

export interface Tab {
  id: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  class?: string;
}

export function TabBar(props: TabBarProps) {
  return (
    <div class={`flex items-center gap-1 ${props.class || ""}`}>
      <For each={props.tabs}>
        {(tab) => (
          <button
            class={`px-4 py-2 rounded-md text-sm transition-all cursor-pointer ${
              props.activeTab === tab.id
                ? "bg-accent text-white"
                : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
            }`}
            onClick={() => props.onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        )}
      </For>
    </div>
  );
}
