import { createSignal, onMount, For, Show } from "solid-js";
import { listAiAgents, setAiAgent, deleteAiAgent, setSecret, testAiAgent, type AiAgent } from "../lib/tauri";

const PROVIDERS = [
  "openai",
  "anthropic",
  "groq",
  "mistral",
  "cohere",
  "gemini",
  "deepseek",
  "openrouter",
  "perplexity",
  "together",
  "xai",
  "ollama",
  "llamafile",
];

function agentSecretKey(provider: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `ai/${provider}/${slug}`;
}

function tauriErr(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export function AiAgentsView() {
  const [agents, setAgents] = createSignal<AiAgent[]>([]);
  const [selectedName, setSelectedName] = createSignal<string | null>(null);
  const [formName, setFormName] = createSignal("");
  const [formProvider, setFormProvider] = createSignal("openai");
  const [formModel, setFormModel] = createSignal("");
  const [formMaxTokens, setFormMaxTokens] = createSignal(4096);
  const [formTemperature, setFormTemperature] = createSignal("");
  const [formPreamble, setFormPreamble] = createSignal("");
  const [formBaseUrl, setFormBaseUrl] = createSignal("");
  const [formApiKey, setFormApiKey] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Test panel
  const [testPrompt, setTestPrompt] = createSignal("");
  const [testResponse, setTestResponse] = createSignal<string | null>(null);
  const [testRunning, setTestRunning] = createSignal(false);
  const [testError, setTestError] = createSignal<string | null>(null);

  const refresh = async () => {
    try {
      const list = await listAiAgents();
      setAgents(list);
    } catch (e) {
      setError(tauriErr(e));
    }
  };

  onMount(refresh);

  const selectAgent = (agent: AiAgent) => {
    setSelectedName(agent.name);
    setFormName(agent.name);
    setFormProvider(agent.provider);
    setFormModel(agent.model);
    setFormMaxTokens(agent.max_tokens);
    setFormTemperature(agent.temperature != null ? String(agent.temperature) : "");
    setFormPreamble(agent.preamble ?? "");
    setFormBaseUrl(agent.base_url ?? "");
    setFormApiKey("");
    setError(null);
    setTestResponse(null);
    setTestError(null);
  };

  const handleNew = () => {
    setSelectedName(null);
    setFormName("");
    setFormProvider("openai");
    setFormModel("");
    setFormMaxTokens(4096);
    setFormTemperature("");
    setFormPreamble("");
    setFormBaseUrl("");
    setFormApiKey("");
    setError(null);
    setTestResponse(null);
    setTestError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const tempStr = formTemperature().trim();
      const temperature = tempStr !== "" ? parseFloat(tempStr) : undefined;
      const preamble = formPreamble().trim() || undefined;
      const base_url = formBaseUrl().trim() || undefined;
      await setAiAgent({ name: formName(), provider: formProvider(), model: formModel(), max_tokens: formMaxTokens(), temperature, preamble, base_url });
      const needsKey = formApiKey().trim() && !["ollama", "llamafile"].includes(formProvider());
      if (needsKey) {
        await setSecret(derivedKey(), formApiKey().trim());
        setFormApiKey("");
      }
      await refresh();
      setSelectedName(formName());
    } catch (e) {
      setError(tauriErr(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const name = selectedName();
    if (!name) return;
    if (!confirm(`Delete agent "${name}"?`)) return;
    try {
      await deleteAiAgent(name);
      setSelectedName(null);
      setFormName("");
      await refresh();
    } catch (e) {
      setError(tauriErr(e));
    }
  };

  const handleTest = async () => {
    const name = selectedName();
    if (!name || !testPrompt().trim()) return;
    setTestRunning(true);
    setTestResponse(null);
    setTestError(null);
    try {
      const result = await testAiAgent(name, testPrompt().trim());
      setTestResponse(result);
    } catch (e: unknown) {
      setTestError(tauriErr(e));
    } finally {
      setTestRunning(false);
    }
  };

  const derivedKey = () => agentSecretKey(formProvider(), formName());

  return (
    <div class="flex h-full min-h-0">
      {/* Sidebar */}
      <div class="w-56 shrink-0 border-r border-border flex flex-col">
        <div class="flex items-center justify-between px-3 py-2 border-b border-border">
          <span class="text-text-secondary text-xs font-medium uppercase tracking-wide">
            Agents
          </span>
          <button
            type="button"
            onClick={handleNew}
            class="text-xs px-2 py-0.5 rounded bg-accent hover:bg-accent-hover text-white transition-colors cursor-pointer"
          >
            + New
          </button>
        </div>
        <div class="flex-1 overflow-y-auto">
          <For each={agents()}>
            {(agent) => (
              <button
                type="button"
                onClick={() => selectAgent(agent)}
                class="w-full text-left px-3 py-2 text-sm transition-colors cursor-pointer"
                classList={{
                  "bg-accent/20 text-text-primary": selectedName() === agent.name,
                  "text-text-secondary hover:bg-bg-tertiary": selectedName() !== agent.name,
                }}
              >
                <div class="truncate font-medium">{agent.name}</div>
                <div class="truncate text-xs text-text-tertiary">
                  {agent.provider} · {agent.model}
                </div>
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Config form */}
      <div class="w-80 shrink-0 border-r border-border overflow-y-auto p-6">
        <div class="space-y-4">
          <h2 class="text-text-primary font-medium text-sm">
            {selectedName() ? `Edit: ${selectedName()}` : "New Agent"}
          </h2>

          <div class="space-y-1">
            <label class="text-text-secondary text-xs">Name</label>
            <input
              type="text"
              value={formName()}
              onInput={(e) => setFormName(e.currentTarget.value)}
              placeholder="My GPT"
              class="w-full bg-bg-tertiary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          <div class="space-y-1">
            <label class="text-text-secondary text-xs">Provider</label>
            <div class="relative">
              <select
                onChange={(e) => setFormProvider(e.currentTarget.value)}
                class="w-full appearance-none bg-bg-tertiary border border-border rounded px-3 py-1.5 pr-8 text-sm text-text-primary focus:outline-none focus:border-accent cursor-pointer"
              >
                <For each={PROVIDERS}>{(p) => <option value={p} selected={formProvider() === p} style="background-color: var(--color-bg-tertiary); color: var(--color-text-primary);">{p}</option>}</For>
              </select>
              <div class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-text-secondary">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          <div class="space-y-1">
            <label class="text-text-secondary text-xs">Model</label>
            <input
              type="text"
              value={formModel()}
              onInput={(e) => setFormModel(e.currentTarget.value)}
              placeholder="e.g. gpt-4o-mini, claude-haiku-4-5-20251001"
              class="w-full bg-bg-tertiary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          <div class="space-y-1">
            <label class="text-text-secondary text-xs">Max Tokens</label>
            <input
              type="number"
              min="1"
              value={formMaxTokens()}
              onInput={(e) => setFormMaxTokens(parseInt(e.currentTarget.value) || 4096)}
              class="w-full bg-bg-tertiary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          <div class="space-y-1">
            <label class="text-text-secondary text-xs">Temperature</label>
            <input
              type="number"
              min="0"
              max="2"
              step="0.01"
              value={formTemperature()}
              onInput={(e) => setFormTemperature(e.currentTarget.value)}
              placeholder="Provider default"
              class="w-full bg-bg-tertiary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
            />
            <p class="text-text-tertiary text-xs">0.0–2.0. Leave blank to use the provider default.</p>
          </div>

          <div class="space-y-1">
            <label class="text-text-secondary text-xs">System Prompt</label>
            <textarea
              value={formPreamble()}
              onInput={(e) => setFormPreamble(e.currentTarget.value)}
              placeholder="Optional system prompt sent before every message"
              rows={4}
              class="w-full bg-bg-tertiary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent resize-y"
            />
          </div>

          <Show when={["ollama", "llamafile"].includes(formProvider())}>
            <div class="space-y-1">
              <label class="text-text-secondary text-xs">Base URL</label>
              <input
                type="text"
                value={formBaseUrl()}
                onInput={(e) => setFormBaseUrl(e.currentTarget.value)}
                placeholder={formProvider() === "llamafile" ? "http://localhost:8080" : "http://localhost:11434"}
                class="w-full bg-bg-tertiary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
              <p class="text-text-tertiary text-xs">Leave blank to use the default local address.</p>
            </div>
          </Show>

          <Show when={!["ollama", "llamafile"].includes(formProvider())}>
            <div class="space-y-1">
              <label class="text-text-secondary text-xs">API Key</label>
              <input
                type="password"
                value={formApiKey()}
                onInput={(e) => setFormApiKey(e.currentTarget.value)}
                placeholder={selectedName() ? "Leave blank to keep existing key" : "Paste your API key"}
                class="w-full bg-bg-tertiary border border-border rounded px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
              <p class="text-text-tertiary text-xs">
                Stored as <span class="font-mono text-accent">{derivedKey()}</span> in the secrets store.
              </p>
            </div>
          </Show>

          {error() && (
            <div class="text-error text-xs bg-error/10 border border-error/30 rounded px-3 py-2">
              {error()}
            </div>
          )}

          <div class="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving() || !formName().trim() || !formModel().trim() || (!selectedName() && !["ollama", "llamafile"].includes(formProvider()) && !formApiKey().trim())}
              class="px-4 py-1.5 rounded text-xs font-medium bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
            >
              {saving() ? "Saving\u2026" : "Save"}
            </button>
            {selectedName() && (
              <button
                type="button"
                onClick={handleDelete}
                class="px-4 py-1.5 rounded text-xs font-medium bg-bg-tertiary hover:bg-error/20 text-error border border-border transition-colors cursor-pointer"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Test panel */}
      <div class="flex-1 flex flex-col min-h-0">
        <div class="px-5 py-3 border-b border-border shrink-0">
          <span class="text-text-secondary text-xs font-medium uppercase tracking-wide">Test</span>
          {selectedName() && (
            <span class="ml-2 text-text-tertiary text-xs">· {selectedName()}</span>
          )}
        </div>

        <Show
          when={selectedName()}
          fallback={
            <div class="flex-1 flex items-center justify-center text-text-tertiary text-sm">
              Select an agent to test it
            </div>
          }
        >
          <div class="flex flex-col flex-1 min-h-0 p-5 gap-4">
            {/* Response area */}
            <div class="flex-1 min-h-0 bg-bg-tertiary border border-border rounded overflow-y-auto p-4">
              <Show when={testRunning()}>
                <span class="text-text-tertiary text-sm italic">Running…</span>
              </Show>
              <Show when={testError()}>
                <span class="text-error text-sm">{testError()}</span>
              </Show>
              <Show when={testResponse() !== null && !testRunning()}>
                <pre class="text-text-primary text-sm whitespace-pre-wrap font-sans">{testResponse()}</pre>
              </Show>
              <Show when={testResponse() === null && !testRunning() && !testError()}>
                <span class="text-text-tertiary text-sm italic">Response will appear here</span>
              </Show>
            </div>

            {/* Prompt input */}
            <div class="shrink-0 flex flex-col gap-2">
              <textarea
                value={testPrompt()}
                onInput={(e) => setTestPrompt(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleTest();
                  }
                }}
                placeholder="Enter a prompt… (Ctrl+Enter to send)"
                rows={4}
                class="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent resize-none"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testRunning() || !testPrompt().trim()}
                class="self-end px-4 py-1.5 rounded text-xs font-medium bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors cursor-pointer"
              >
                {testRunning() ? "Running\u2026" : "Send"}
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
