import { JSX } from "solid-js";
import { Toolbar } from "./Toolbar";
import { StatusBar } from "./StatusBar";

interface LayoutProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  statusExpanded: boolean;
  onStatusToggle: () => void;
  children: JSX.Element;
}

export function Layout(props: LayoutProps) {
  return (
    <div class="flex flex-col h-full w-full">
      <Toolbar activeTab={props.activeTab} onTabChange={props.onTabChange} />
      <main class="flex-1 overflow-auto bg-bg-primary">{props.children}</main>
      <StatusBar expanded={props.statusExpanded} onToggle={props.onStatusToggle} />
    </div>
  );
}
