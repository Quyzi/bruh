import { TabBar, Tab } from "./TabBar";
import logo from "../assets/clawde.jpg";

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
        <img
          src={logo}
          alt="Clawdia"
          class="h-8 w-8 object-cover rounded-md"
        />
      </div>
      <TabBar
        tabs={MAIN_TABS}
        activeTab={props.activeTab}
        onTabChange={props.onTabChange}
      />
    </header>
  );
}
