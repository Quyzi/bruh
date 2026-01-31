import { TabBar, Tab } from "./TabBar";

const MAIN_TABS: Tab[] = [
  { id: "setup", label: "Initial Setup" },
  { id: "workflow", label: "Workflow Editor" },
  { id: "secrets", label: "Secrets" },
  { id: "database", label: "Database" },
];

interface ToolbarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <header class="flex items-center h-12 min-h-12 bg-bg-secondary border-b border-border px-4 gap-4">
      <div class="flex items-center gap-2 pr-4 border-r border-border">
        <div class="w-8 h-8 bg-bg-tertiary rounded-md flex items-center justify-center text-text-secondary text-xs">
          C
        </div>
      </div>
      <TabBar
        tabs={MAIN_TABS}
        activeTab={props.activeTab}
        onTabChange={props.onTabChange}
      />
    </header>
  );
}
