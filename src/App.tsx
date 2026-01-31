import { createSignal, Match, Switch } from "solid-js";
import { Layout } from "./components/Layout";
import { SetupView } from "./views/SetupView";
import { WorkflowView } from "./views/WorkflowView";
import { SecretsView } from "./views/SecretsView";
import { DatabaseView } from "./views/DatabaseView";
import "./App.css";

export type TabId = "setup" | "workflow" | "secrets" | "database";

function App() {
  const [activeTab, setActiveTab] = createSignal<TabId>("setup");
  const [statusExpanded, setStatusExpanded] = createSignal(false);

  return (
    <Layout
      activeTab={activeTab()}
      onTabChange={(tab) => setActiveTab(tab as TabId)}
      statusExpanded={statusExpanded()}
      onStatusToggle={() => setStatusExpanded(!statusExpanded())}
    >
      <Switch>
        <Match when={activeTab() === "setup"}>
          <SetupView />
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
      </Switch>
    </Layout>
  );
}

export default App;
