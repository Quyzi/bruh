import { createSignal, onMount, Show } from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  getSetupStatus,
  saveTwitchCredentials,
  testTwitchCredentials,
  getTwitchAuthUrl,
  validateTwitchToken,
  logoutTwitch,
  type SetupStatus,
  type TestResult,
} from "../lib/tauri";

interface SetupViewProps {
  oauthStatus?: string | null;
  onOauthStatusChange?: (status: string | null) => void;
}

export function SetupView(props: SetupViewProps) {
  const [clientId, setClientId] = createSignal("");
  const [clientSecret, setClientSecret] = createSignal("");
  const [status, setStatus] = createSignal<SetupStatus | null>(null);
  const [testResult, setTestResult] = createSignal<TestResult | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [testing, setTesting] = createSignal(false);
  const [authorizing, setAuthorizing] = createSignal(false);
  const [saveSuccess, setSaveSuccess] = createSignal(false);
  const [twitchUsername, setTwitchUsername] = createSignal<string | null>(null);

  const loadStatus = async () => {
    try {
      const s = await getSetupStatus();
      setStatus(s);

      // If user is authorized, validate and get username
      if (s.userAuthorized) {
        try {
          const result = await validateTwitchToken();
          if (result.success && result.username) {
            setTwitchUsername(result.username);
          }
        } catch (e) {
          console.error("Failed to validate token:", e);
        }
      }
    } catch (e) {
      console.error("Failed to get setup status:", e);
    }
  };

  onMount(loadStatus);

  const handleSave = async () => {
    setError(null);
    setSaveSuccess(false);
    setTestResult(null);
    setSaving(true);

    try {
      await saveTwitchCredentials(clientId(), clientSecret());
      setSaveSuccess(true);
      setClientId("");
      setClientSecret("");
      await loadStatus();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to save credentials");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setError(null);
    setTestResult(null);
    setTesting(true);

    try {
      const result = await testTwitchCredentials();
      setTestResult(result);
      if (result.success) {
        await loadStatus();
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to test credentials");
    } finally {
      setTesting(false);
    }
  };

  const handleAuthorize = async () => {
    setError(null);
    setAuthorizing(true);
    props.onOauthStatusChange?.(null);

    try {
      const { url } = await getTwitchAuthUrl();
      // Open the authorization URL in the default browser
      await openUrl(url);
      props.onOauthStatusChange?.("Waiting for authorization... Please complete the authorization in your browser.");
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to start authorization");
      setAuthorizing(false);
    }
  };

  const handleLogout = async () => {
    setError(null);
    try {
      await logoutTwitch();
      setTwitchUsername(null);
      setTestResult(null);
      props.onOauthStatusChange?.(null);
      await loadStatus();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to logout");
    }
  };

  // Update authorizing state when oauth completes
  const oauthComplete = () => {
    const oauthStatus = props.oauthStatus;
    if (oauthStatus && !oauthStatus.includes("Waiting")) {
      setAuthorizing(false);
      // Reload status after successful auth
      if (oauthStatus.includes("Successfully")) {
        loadStatus();
      }
    }
  };

  // React to oauthStatus changes
  onMount(() => {
    oauthComplete();
  });

  return (
    <div class="flex flex-col items-center justify-start h-full p-8 overflow-auto">
      <div class="w-full max-w-lg space-y-6">
        <div class="text-center space-y-2">
          <h2 class="text-text-primary font-medium text-2xl">Clawdia Setup</h2>
          <p class="text-text-secondary">
            Configure your Twitch API credentials to get started
          </p>
        </div>

        {/* Twitch Credentials Section */}
        <div class="bg-bg-secondary rounded-lg p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-text-primary font-medium">Twitch Credentials</h3>
            <Show when={status()}>
              <span
                class={`text-xs px-2 py-1 rounded ${
                  status()!.credentialsConfigured
                    ? "bg-success/20 text-success"
                    : "bg-warning/20 text-warning"
                }`}
              >
                {status()!.credentialsConfigured ? "Configured" : "Not Configured"}
              </span>
            </Show>
          </div>

          <p class="text-text-secondary text-sm">
            Create an application at the{" "}
            <a
              href="https://dev.twitch.tv/console/apps"
              target="_blank"
              rel="noopener noreferrer"
              class="text-accent hover:text-accent-hover underline"
            >
              Twitch Developer Console
            </a>{" "}
            to get your Client ID and Client Secret.
          </p>

          <p class="text-text-tertiary text-xs bg-bg-tertiary rounded p-2">
            <strong>OAuth Redirect URL:</strong> http://localhost:1420/callback
          </p>

          <div class="space-y-3">
            <div>
              <label class="block text-text-secondary text-sm mb-1">
                Client ID
              </label>
              <input
                type="text"
                value={clientId()}
                onInput={(e) => setClientId(e.currentTarget.value)}
                placeholder="Enter your Twitch Client ID"
                class="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label class="block text-text-secondary text-sm mb-1">
                Client Secret
              </label>
              <input
                type="password"
                value={clientSecret()}
                onInput={(e) => setClientSecret(e.currentTarget.value)}
                placeholder="Enter your Twitch Client Secret"
                class="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div class="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving() || !clientId() || !clientSecret()}
              class="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors cursor-pointer"
            >
              {saving() ? "Saving..." : "Save Credentials"}
            </button>
          </div>
        </div>

        {/* User Authorization Section */}
        <Show when={status()?.credentialsConfigured}>
          <div class="bg-bg-secondary rounded-lg p-6 space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-text-primary font-medium">User Authorization</h3>
              <Show when={status()}>
                <span
                  class={`text-xs px-2 py-1 rounded ${
                    status()!.userAuthorized
                      ? "bg-success/20 text-success"
                      : "bg-warning/20 text-warning"
                  }`}
                >
                  {status()!.userAuthorized ? "Authorized" : "Not Authorized"}
                </span>
              </Show>
            </div>

            <Show when={twitchUsername()}>
              <div class="flex items-center gap-2 text-text-secondary">
                <span>Logged in as:</span>
                <span class="text-text-primary font-medium">{twitchUsername()}</span>
              </div>
            </Show>

            <p class="text-text-secondary text-sm">
              {status()?.userAuthorized
                ? "Your Twitch account is authorized. You can re-authorize or logout below."
                : "Authorize Clawdia to access your Twitch account for reading and sending chat messages."}
            </p>

            <div class="flex gap-3 pt-2">
              <button
                onClick={handleAuthorize}
                disabled={authorizing()}
                class="flex-1 bg-[#9146FF] hover:bg-[#7c3ae6] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors cursor-pointer"
              >
                {authorizing() ? "Authorizing..." : status()?.userAuthorized ? "Re-authorize with Twitch" : "Authorize with Twitch"}
              </button>
              <Show when={status()?.userAuthorized}>
                <button
                  onClick={handleLogout}
                  class="bg-bg-tertiary hover:bg-border text-text-primary font-medium py-2 px-4 rounded border border-border transition-colors cursor-pointer"
                >
                  Logout
                </button>
              </Show>
            </div>

            <Show when={status()?.userAuthorized}>
              <button
                onClick={handleTest}
                disabled={testing()}
                class="w-full bg-bg-tertiary hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed text-text-primary font-medium py-2 px-4 rounded border border-border transition-colors cursor-pointer"
              >
                {testing() ? "Testing..." : "Test Connection"}
              </button>
            </Show>
          </div>
        </Show>

        {/* Status Messages */}
        <Show when={saveSuccess()}>
          <div class="bg-success/10 border border-success/30 rounded-lg p-4 text-success">
            Credentials saved successfully!
          </div>
        </Show>

        <Show when={props.oauthStatus}>
          <div
            class={`rounded-lg p-4 ${
              props.oauthStatus!.includes("Successfully")
                ? "bg-success/10 border border-success/30 text-success"
                : props.oauthStatus!.includes("failed")
                ? "bg-error/10 border border-error/30 text-error"
                : "bg-accent/10 border border-accent/30 text-accent"
            }`}
          >
            {props.oauthStatus}
          </div>
        </Show>

        <Show when={error()}>
          <div class="bg-error/10 border border-error/30 rounded-lg p-4 text-error">
            {error()}
          </div>
        </Show>

        <Show when={testResult()}>
          <div
            class={`rounded-lg p-4 ${
              testResult()!.success
                ? "bg-success/10 border border-success/30 text-success"
                : "bg-error/10 border border-error/30 text-error"
            }`}
          >
            <div class="font-medium">
              {testResult()!.success ? "Connection Successful" : "Connection Failed"}
            </div>
            <div class="text-sm mt-1 opacity-80">{testResult()!.message}</div>
          </div>
        </Show>
      </div>
    </div>
  );
}
