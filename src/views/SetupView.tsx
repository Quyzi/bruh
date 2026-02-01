import { createSignal, onMount, Show } from "solid-js";
import {
  getSetupStatus,
  saveTwitchCredentials,
  testTwitchCredentials,
  type SetupStatus,
  type TestResult,
} from "../lib/tauri";

export function SetupView() {
  const [clientId, setClientId] = createSignal("");
  const [clientSecret, setClientSecret] = createSignal("");
  const [status, setStatus] = createSignal<SetupStatus | null>(null);
  const [testResult, setTestResult] = createSignal<TestResult | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [testing, setTesting] = createSignal(false);
  const [saveSuccess, setSaveSuccess] = createSignal(false);

  onMount(async () => {
    try {
      const s = await getSetupStatus();
      setStatus(s);
    } catch (e) {
      console.error("Failed to get setup status:", e);
    }
  });

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
      const s = await getSetupStatus();
      setStatus(s);
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
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to test credentials");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div class="flex flex-col items-center justify-start h-full p-8 overflow-auto">
      <div class="w-full max-w-lg space-y-6">
        <div class="text-center space-y-2">
          <h2 class="text-text-primary font-medium text-2xl">Initial Setup</h2>
          <p class="text-text-secondary">
            Configure your Twitch API credentials to get started
          </p>
        </div>

        <div class="bg-bg-secondary rounded-lg p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-text-primary font-medium">Twitch Credentials</h3>
            <Show when={status()}>
              <span
                class={`text-xs px-2 py-1 rounded ${
                  status()!.twitch_configured
                    ? "bg-success/20 text-success"
                    : "bg-warning/20 text-warning"
                }`}
              >
                {status()!.twitch_configured ? "Configured" : "Not Configured"}
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
              class="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
            >
              {saving() ? "Saving..." : "Save Credentials"}
            </button>
            <button
              onClick={handleTest}
              disabled={testing() || !status()?.twitch_configured}
              class="flex-1 bg-bg-tertiary hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed text-text-primary font-medium py-2 px-4 rounded border border-border transition-colors"
            >
              {testing() ? "Testing..." : "Test Connection"}
            </button>
          </div>
        </div>

        <Show when={saveSuccess()}>
          <div class="bg-success/10 border border-success/30 rounded-lg p-4 text-success">
            Credentials saved successfully!
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
