import { TabBar, Tab } from "./TabBar";
import logo from "../assets/clawde.jpg";

const MAIN_TABS: Tab[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "channels", label: "Channels" },
  { id: "workflow", label: "Workflow Editor" },
  { id: "scripts", label: "Scripts" },
  { id: "secrets", label: "Secrets" },
  { id: "database", label: "Database" },
  { id: "setup", label: "Setup" },
];

interface ToolbarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <header class="flex items-center shrink-0 h-9 min-h-9 bg-bg-secondary border-b border-border pl-0 pr-2 gap-2">
      <div class="relative pr-2 border-r border-border self-stretch w-9 h-9 shrink-0 overflow-hidden rounded">
        <img
          src={logo}
          alt="Clawdia"
          class="absolute inset-0 block h-full w-full object-cover object-center"
          style={{ transform: "scale(1.4)" }}
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
