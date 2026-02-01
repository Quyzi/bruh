import { createSignal, Match, Switch, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { Layout } from "./components/Layout";
import { DashboardView } from "./views/DashboardView";
import { ChannelsView } from "./views/ChannelsView";
import { SetupView } from "./views/SetupView";
import { WorkflowView } from "./views/WorkflowView";
import { SecretsView } from "./views/SecretsView";
import { DatabaseView } from "./views/DatabaseView";
import "./App.css";

export type TabId = "dashboard" | "channels" | "workflow" | "secrets" | "database" | "setup";

function App() {
  const [activeTab, setActiveTab] = createSignal<TabId>("dashboard");
  const [statusExpanded, setStatusExpanded] = createSignal(false);
  const [oauthStatus, setOauthStatus] = createSignal<string | null>(null);

  // Handle OAuth callback on app load
  onMount(async () => {
    const url = new URL(window.location.href);
    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        const errorDesc = url.searchParams.get("error_description") || error;
        setOauthStatus(`Authorization failed: ${errorDesc}`);
        setActiveTab("setup");
      } else if (code && state) {
        setOauthStatus("Exchanging authorization code...");
        setActiveTab("setup");
        try {
          const result = await invoke<{ success: boolean; message: string; username?: string }>(
            "exchange_twitch_code",
            { code, state }
          );
          if (result.success) {
            setOauthStatus(`Successfully authorized as ${result.username}`);
          } else {
            setOauthStatus(`Authorization failed: ${result.message}`);
          }
        } catch (err) {
          setOauthStatus(`Authorization failed: ${err}`);
        }
      }

      // Clear the URL params after processing
      window.history.replaceState({}, "", "/");
    }
  });

  return (
    <Layout
      activeTab={activeTab()}
      onTabChange={(tab) => setActiveTab(tab as TabId)}
      statusExpanded={statusExpanded()}
      onStatusToggle={() => setStatusExpanded(!statusExpanded())}
    >
      <Switch>
        <Match when={activeTab() === "dashboard"}>
          <DashboardView />
        </Match>
        <Match when={activeTab() === "channels"}>
          <ChannelsView />
        </Match>
        <Match when={activeTab() === "workflow"}>
          <WorkflowView />
        </Match>
        <Match when={activeTab() === "secrets"}>
          <SecretsView />
        </Match>
        <Match when={activeTab() === "database"}>
          <DatabaseView />
        </Match>
        <Match when={activeTab() === "setup"}>
          <SetupView oauthStatus={oauthStatus()} onOauthStatusChange={setOauthStatus} />
        </Match>
      </Switch>
    </Layout>
  );
}

export default App;
