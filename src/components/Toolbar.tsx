import { createSignal, onMount } from "solid-js";
import { TabBar, Tab } from "./TabBar";
import { GitControls } from "./GitControls";
import logo from "../assets/logo.png";
import {
  getRuntimeState,
  getOverlayWindowState,
  runtimeStart,
  runtimeStop,
  toggleOverlayWindow,
  type RuntimeState,
} from "../lib/tauri";

const MAIN_TABS: Tab[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "channels", label: "Channels" },
  { id: "workflow", label: "Workflow Editor" },
  { id: "scripts", label: "Scripts" },
  { id: "ai-agents", label: "Agents" },
  { id: "secrets", label: "Secrets" },
  { id: "database", label: "Database" },
  { id: "overlay", label: "Overlay" },
  { id: "setup", label: "Setup" },
  { id: "help", label: "Help" },
];

interface ToolbarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function Toolbar(props: ToolbarProps) {
  const [status, setStatus] = createSignal<RuntimeState | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [overlayVisible, setOverlayVisible] = createSignal(false);

  const refreshStatus = async () => {
    try {
      const state = await getRuntimeState();
      setStatus(state);
    } catch {
      setStatus(null);
    }
  };

  onMount(() => {
    refreshStatus();
    getOverlayWindowState().then(setOverlayVisible).catch(() => {});
  });

  const isRunning = () => status() === "running";
  const isStopped = () => status() === "stopped";

  const handleStart = async () => {
    setLoading(true);
    try {
      await runtimeStart();
      await refreshStatus();
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await runtimeStop();
      await refreshStatus();
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      await runtimeStop();
      await runtimeStart();
      await refreshStatus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <header class="flex items-center shrink-0 h-9 min-h-9 bg-bg-secondary border-b border-border pl-0 pr-2 gap-2">
      <div class="relative pr-2 border-r border-border self-stretch w-9 h-9 shrink-0 overflow-hidden rounded">
        <img
          src={logo}
          alt="Bruh"
          class="absolute inset-0 block h-full w-full object-cover object-center"
          style={{ transform: "scale(1.4)" }}
        />
      </div>
      <TabBar
        tabs={MAIN_TABS}
        activeTab={props.activeTab}
        onTabChange={props.onTabChange}
      />
      <div class="ml-auto flex items-center gap-2">
        <GitControls />
        <div class="w-px h-4 bg-border shrink-0" />
        <span
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
          classList={{
            "bg-success/15 text-success": isRunning(),
            "bg-bg-tertiary text-text-secondary": !isRunning(),
          }}
        >
          <span
            class="w-1.5 h-1.5 rounded-full shrink-0"
            classList={{
              "bg-success": isRunning(),
              "bg-text-secondary": !isRunning(),
            }}
          />
          {status() === null ? "…" : isRunning() ? "Running" : "Stopped"}
        </span>
        <button
          type="button"
          disabled={loading() || isRunning()}
          onClick={handleStart}
          class="h-6 px-2 rounded text-xs font-medium bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
        >
          Start
        </button>
        <button
          type="button"
          disabled={loading() || isStopped()}
          onClick={handleStop}
          class="h-6 px-2 rounded text-xs font-medium bg-bg-tertiary hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed text-text-primary border border-border transition-colors cursor-pointer"
        >
          Stop
        </button>
        <button
          type="button"
          disabled={loading() || isStopped()}
          onClick={handleRestart}
          class="h-6 px-2 rounded text-xs font-medium bg-bg-tertiary hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed text-text-primary border border-border transition-colors cursor-pointer"
        >
          Restart
        </button>
        <div class="w-px h-4 bg-border shrink-0" />
        <button
          type="button"
          onClick={async () => {
            await toggleOverlayWindow();
            setOverlayVisible(!overlayVisible());
          }}
          class="h-6 px-2 rounded text-xs font-medium bg-bg-tertiary hover:bg-border text-text-primary border border-border transition-colors cursor-pointer"
          title={overlayVisible() ? "Hide Overlay" : "Show Overlay"}
        >
          {overlayVisible() ? "◉" : "○"}
        </button>
      </div>
    </header>
  );
}
