import { createSignal } from "solid-js";
import { Layout } from "./components/Layout";
import { DashboardView } from "./views/DashboardView";
import { ChannelsView } from "./views/ChannelsView";
import { SetupView } from "./views/SetupView";
import { WorkflowView } from "./views/WorkflowView";
import { ScriptsView } from "./views/ScriptsView";
import { AiAgentsView } from "./views/AiAgentsView";
import { SecretsView } from "./views/SecretsView";
import { DatabaseView } from "./views/DatabaseView";
import { TestView } from "./views/TestView";
import { HelpView } from "./docs/HelpView";
import "./App.css";

export type TabId = "dashboard" | "channels" | "workflow" | "scripts" | "ai-agents" | "secrets" | "database" | "setup" | "help";

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
  const [revealed, setRevealed] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  const copyAndReveal = async () => {
    try {
      await navigator.clipboard.writeText(callbackFullUrl);
      setCopied(true);
      setRevealed(true);
      setTimeout(() => {
        setRevealed(false);
        setCopied(false);
      }, 2000);
    } catch {
      // Fallback - just reveal
      setRevealed(true);
      setTimeout(() => setRevealed(false), 2000);
    }
  };

  return (
    <div class="min-h-screen bg-bg-primary flex items-center justify-center p-8">
      <div class="max-w-lg w-full bg-bg-secondary rounded-lg p-8 space-y-6">
        <div class="text-center space-y-2">
          <div class="text-4xl mb-4">✓</div>
          <h1 class="text-text-primary font-medium text-2xl">Authorization Successful!</h1>
          <p class="text-text-secondary">
            Copy the URL below and paste it into the Bruh app to complete setup.
          </p>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-text-secondary text-sm mb-2">
              Callback URL (click to copy):
            </label>
            <div
              onClick={copyAndReveal}
              class={`bg-bg-tertiary border border-border rounded p-3 text-text-primary text-xs font-mono break-all cursor-pointer hover:bg-bg-secondary transition-all ${
                revealed() ? "select-all" : "blur-sm hover:blur-[2px]"
              }`}
              title="Click to copy and reveal"
            >
              {callbackFullUrl}
            </div>
            <p class="text-text-tertiary text-xs mt-1 italic">
              URL is blurred for privacy - click to copy and reveal
            </p>
          </div>

          <button
            onClick={copyAndReveal}
            class="w-full bg-accent hover:bg-accent-hover text-white font-medium py-2 px-4 rounded transition-colors cursor-pointer"
          >
            {copied() ? "Copied!" : "Copy URL to Clipboard"}
          </button>

          <div class="bg-accent/10 border border-accent/30 rounded p-3 text-accent text-sm">
            <strong>Next steps:</strong>
            <ol class="list-decimal list-inside mt-2 space-y-1">
              <li>Copy the URL above</li>
              <li>Go back to the Bruh app</li>
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
          Please close this tab and try again from the Bruh app.
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
      {/* All views rendered but only active one visible – keeps state when switching tabs */}
      <div class={activeTab() === "dashboard" ? "h-full flex flex-col min-h-0" : "hidden"}>
        <DashboardView />
      </div>
      <div class={activeTab() === "channels" ? "h-full flex flex-col min-h-0" : "hidden"}>
        <ChannelsView />
      </div>
      <div class={activeTab() === "workflow" ? "h-full flex flex-col min-h-0" : "hidden"}>
        <WorkflowView isActive={activeTab() === "workflow"} />
      </div>
      <div class={activeTab() === "scripts" ? "h-full flex flex-col min-h-0" : "hidden"}>
        <ScriptsView />
      </div>
      <div class={activeTab() === "ai-agents" ? "h-full flex flex-col min-h-0" : "hidden"}>
        <AiAgentsView />
      </div>
      <div class={activeTab() === "secrets" ? "h-full flex flex-col min-h-0" : "hidden"}>
        <SecretsView isActive={activeTab() === "secrets"} />
      </div>
      <div class={activeTab() === "database" ? "h-full flex flex-col min-h-0" : "hidden"}>
        <DatabaseView />
      </div>
      <div class={activeTab() === "setup" ? "h-full flex flex-col min-h-0" : "hidden"}>
        <SetupView oauthStatus={oauthStatus()} onOauthStatusChange={setOauthStatus} />
      </div>
      <div class={activeTab() === "help" ? "h-full flex flex-col min-h-0" : "hidden"}>
        <HelpView />
      </div>
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
