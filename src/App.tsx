import { createSignal, Match, Switch, onMount, Show } from "solid-js";
import { Layout } from "./components/Layout";
import { DashboardView } from "./views/DashboardView";
import { ChannelsView } from "./views/ChannelsView";
import { SetupView } from "./views/SetupView";
import { WorkflowView } from "./views/WorkflowView";
import { SecretsView } from "./views/SecretsView";
import { DatabaseView } from "./views/DatabaseView";
import "./App.css";

export type TabId = "dashboard" | "channels" | "workflow" | "secrets" | "database" | "setup";

// Check for callback URL immediately (before component renders)
const initialUrl = new URL(window.location.href);
const isCallback = initialUrl.pathname === "/callback" && initialUrl.searchParams.has("code");
const callbackFullUrl = isCallback ? window.location.href : "";
const callbackError = initialUrl.pathname === "/callback" ? initialUrl.searchParams.get("error") : null;
const callbackErrorDesc = callbackError 
  ? (initialUrl.searchParams.get("error_description") || callbackError) 
  : null;

// Callback page component - shown when Twitch redirects back in external browser
function CallbackPage() {
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(callbackFullUrl);
      const btn = document.getElementById("copy-btn");
      if (btn) {
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = "Copy URL to Clipboard";
        }, 2000);
      }
    } catch {
      // Fallback - select the text
      const div = document.querySelector(".select-all");
      if (div) {
        const range = document.createRange();
        range.selectNodeContents(div);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  };

  return (
    <div class="min-h-screen bg-bg-primary flex items-center justify-center p-8">
      <div class="max-w-lg w-full bg-bg-secondary rounded-lg p-8 space-y-6">
        <div class="text-center space-y-2">
          <div class="text-4xl mb-4">✓</div>
          <h1 class="text-text-primary font-medium text-2xl">Authorization Successful!</h1>
          <p class="text-text-secondary">
            Copy the URL below and paste it into the Clawdia app to complete setup.
          </p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-text-secondary text-sm mb-2">
              Callback URL (copy this entire URL):
            </label>
            <div class="bg-bg-tertiary border border-border rounded p-3 text-text-primary text-xs font-mono break-all select-all">
              {callbackFullUrl}
            </div>
          </div>

          <button
            onClick={copyUrl}
            id="copy-btn"
            class="w-full bg-accent hover:bg-accent-hover text-white font-medium py-2 px-4 rounded transition-colors cursor-pointer"
          >
            Copy URL to Clipboard
          </button>

          <div class="bg-accent/10 border border-accent/30 rounded p-3 text-accent text-sm">
            <strong>Next steps:</strong>
            <ol class="list-decimal list-inside mt-2 space-y-1">
              <li>Copy the URL above</li>
              <li>Go back to the Clawdia app</li>
              <li>Paste the URL in the "Paste Callback URL" field</li>
            </ol>
          </div>

          <p class="text-text-tertiary text-xs text-center">
            You can close this browser tab after copying the URL.
          </p>
        </div>
      </div>
    </div>
  );
}

// Error page for OAuth errors
function CallbackErrorPage() {
  return (
    <div class="min-h-screen bg-bg-primary flex items-center justify-center p-8">
      <div class="max-w-lg w-full bg-bg-secondary rounded-lg p-8 space-y-6">
        <div class="text-center space-y-2">
          <div class="text-4xl mb-4">✗</div>
          <h1 class="text-text-primary font-medium text-2xl">Authorization Failed</h1>
          <p class="text-error">{callbackErrorDesc}</p>
        </div>
        <p class="text-text-tertiary text-sm text-center">
          Please close this tab and try again from the Clawdia app.
        </p>
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = createSignal<TabId>("dashboard");
  const [statusExpanded, setStatusExpanded] = createSignal(false);
  const [oauthStatus, setOauthStatus] = createSignal<string | null>(null);

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

// Export the appropriate component based on URL
export default function Root() {
  // Handle callback pages before rendering the main app
  if (isCallback) {
    return <CallbackPage />;
  }
  
  if (callbackError) {
    return <CallbackErrorPage />;
  }
  
  return <App />;
}
