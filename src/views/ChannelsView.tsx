import { createSignal, onMount, For, Show } from "solid-js";
import {
  loadChannels,
  saveChannels,
  validateChannel,
  type Channel,
} from "../lib/tauri";

export function ChannelsView() {
  const [channels, setChannels] = createSignal<Channel[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const [showAddForm, setShowAddForm] = createSignal(false);
  const [newLogin, setNewLogin] = createSignal("");
  const [adding, setAdding] = createSignal(false);

  const [deleteConfirm, setDeleteConfirm] = createSignal<string | null>(null);

  const loadChannelsList = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await loadChannels();
      setChannels(list);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to load channels");
    } finally {
      setLoading(false);
    }
  };

  onMount(loadChannelsList);

  const handleAdd = async () => {
    const login = newLogin().trim();
    if (!login) return;

    setAdding(true);
    setError(null);

    try {
      const result = await validateChannel(login);
      if (!result.valid) {
        setError(result.message);
        return;
      }
      const newChannel: Channel = {
        login: login.toLowerCase(),
        display_name: result.displayName ?? undefined,
      };
      const next = [...channels(), newChannel];
      setChannels(next);
      await saveChannels(next);
      setNewLogin("");
      setShowAddForm(false);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to add channel");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (login: string) => {
    setError(null);
    try {
      const next = channels().filter((channel) => channel.login !== login);
      setChannels(next);
      await saveChannels(next);
      setDeleteConfirm(null);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? `Failed to delete channel: ${login}`);
    }
  };

  return (
    <div class="flex flex-col h-full p-6 overflow-auto">
      <div class="max-w-3xl mx-auto w-full space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-text-primary font-medium text-xl">Channels</h2>
            <p class="text-text-secondary text-sm">
              Manage your Twitch channels and connections
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            class="bg-accent hover:bg-accent-hover text-white font-medium py-2 px-4 rounded transition-colors flex items-center gap-2"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Channel
          </button>
        </div>

        <Show when={error()}>
          <div class="bg-error/10 border border-error/30 rounded-lg p-3 text-error text-sm">
            {error()}
          </div>
        </Show>

        <Show when={showAddForm()}>
          <div class="bg-bg-secondary rounded-lg p-4 space-y-3">
            <h3 class="text-text-primary font-medium">Add Channel</h3>
            <p class="text-text-secondary text-sm">
              Enter the Twitch channel login. The channel will be verified (must
              exist and you must be the owner or a moderator with required
              scopes).
            </p>
            <div>
              <label class="block text-text-secondary text-sm mb-1">
                Channel login
              </label>
              <input
                type="text"
                value={newLogin()}
                onInput={(e) => setNewLogin(e.currentTarget.value)}
                placeholder="channel_username"
                class="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
              />
            </div>
            <div class="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewLogin("");
                  setError(null);
                }}
                class="bg-bg-tertiary hover:bg-border text-text-primary font-medium py-2 px-4 rounded border border-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={adding() || !newLogin().trim()}
                class="bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
              >
                {adding() ? "Verifying..." : "Add"}
              </button>
            </div>
          </div>
        </Show>

        <div class="bg-bg-secondary rounded-lg overflow-hidden">
          <Show
            when={!loading()}
            fallback={
              <div class="p-8 text-center text-text-secondary">
                Loading channels...
              </div>
            }
          >
            <Show
              when={channels().length > 0}
              fallback={
                <div class="p-8 text-center text-text-secondary">
                  No channels yet. Click "Add Channel" to add one (you must be
                  the channel owner or a moderator and authorized with the
                  required scopes).
                </div>
              }
            >
              <table class="w-full">
                <thead>
                  <tr class="border-b border-border">
                    <th class="text-left text-text-secondary text-sm font-medium px-4 py-3">
                      Login
                    </th>
                    <th class="text-left text-text-secondary text-sm font-medium px-4 py-3">
                      Display name
                    </th>
                    <th class="text-right text-text-secondary text-sm font-medium px-4 py-3 w-24">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <For each={channels()}>
                    {(channel) => (
                      <tr class="border-b border-border/50 last:border-b-0 hover:bg-bg-tertiary/50">
                        <td class="px-4 py-3 text-text-primary font-mono text-sm">
                          {channel.login}
                        </td>
                        <td class="px-4 py-3 text-text-secondary text-sm">
                          {channel.display_name ?? "—"}
                        </td>
                        <td class="px-4 py-3 text-right">
                          <div class="flex items-center justify-end gap-1">
                            <Show
                              when={deleteConfirm() === channel.login}
                              fallback={
                                <button
                                  onClick={() => setDeleteConfirm(channel.login)}
                                  class="p-2 rounded hover:bg-error/20 text-text-secondary hover:text-error transition-colors"
                                  title="Remove channel"
                                >
                                  <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                      stroke-width="2"
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              }
                            >
                              <button
                                onClick={() => handleDelete(channel.login)}
                                class="px-2 py-1 rounded bg-error text-white text-xs font-medium hover:bg-error/80 transition-colors"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                class="px-2 py-1 rounded bg-bg-tertiary text-text-secondary text-xs font-medium hover:bg-border transition-colors"
                              >
                                Cancel
                              </button>
                            </Show>
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
}
