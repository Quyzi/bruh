import { createSignal, createEffect, onMount, For, Show } from "solid-js";
import {
  listSecrets,
  getSecret,
  setSecret,
  deleteSecret,
} from "../lib/tauri";

interface SecretEntry {
  name: string;
  value: string | null;
  visible: boolean;
  loading: boolean;
}

interface SecretsViewProps {
  isActive: boolean;
}

export function SecretsView(props: SecretsViewProps) {
  const [secrets, setSecrets] = createSignal<SecretEntry[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  const [showAddForm, setShowAddForm] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [newValue, setNewValue] = createSignal("");
  const [adding, setAdding] = createSignal(false);

  const [deleteConfirm, setDeleteConfirm] = createSignal<string | null>(null);

  const [editingName, setEditingName] = createSignal<string | null>(null);
  const [editName, setEditName] = createSignal("");
  const [editValue, setEditValue] = createSignal("");
  const [editLoading, setEditLoading] = createSignal(false);
  const [editSaving, setEditSaving] = createSignal(false);

  const loadSecrets = async () => {
    setLoading(true);
    setError(null);
    try {
      const names = await listSecrets();
      setSecrets(
        names.map((name) => ({
          name,
          value: null,
          visible: false,
          loading: false,
        }))
      );
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to load secrets");
    } finally {
      setLoading(false);
    }
  };

  onMount(loadSecrets);
  createEffect(() => { if (props.isActive) loadSecrets(); });

  const toggleVisibility = async (name: string) => {
    const entry = secrets().find((s) => s.name === name);
    if (!entry) return;

    if (entry.visible) {
      setSecrets((prev) =>
        prev.map((s) =>
          s.name === name ? { ...s, visible: false, value: null } : s
        )
      );
      return;
    }

    setSecrets((prev) =>
      prev.map((s) => (s.name === name ? { ...s, loading: true } : s))
    );

    try {
      const value = await getSecret(name);
      setSecrets((prev) =>
        prev.map((s) =>
          s.name === name ? { ...s, value, visible: true, loading: false } : s
        )
      );
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? `Failed to get secret: ${name}`);
      setSecrets((prev) =>
        prev.map((s) => (s.name === name ? { ...s, loading: false } : s))
      );
    }
  };

  const handleAdd = async () => {
    if (!newName().trim() || !newValue()) return;

    setAdding(true);
    setError(null);

    try {
      await setSecret(newName().trim(), newValue());
      setNewName("");
      setNewValue("");
      setShowAddForm(false);
      await loadSecrets();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to add secret");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (name: string) => {
    setError(null);
    try {
      await deleteSecret(name);
      setDeleteConfirm(null);
      await loadSecrets();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? `Failed to delete secret: ${name}`);
    }
  };

  const openEdit = async (name: string) => {
    const entry = secrets().find((s) => s.name === name);
    if (!entry) return;
    setShowAddForm(false);
    setEditingName(name);
    setEditName(name);
    setError(null);
    if (entry.visible && entry.value !== null) {
      setEditValue(entry.value);
    } else {
      setEditValue("");
      setEditLoading(true);
      try {
        const value = await getSecret(name);
        setEditValue(value);
      } catch (e: unknown) {
        const err = e as { message?: string };
        setError(err.message ?? `Failed to load secret: ${name}`);
        setEditingName(null);
      } finally {
        setEditLoading(false);
      }
    }
  };

  const closeEdit = () => {
    setEditingName(null);
    setEditName("");
    setEditValue("");
  };

  const handleSaveEdit = async () => {
    const current = editingName();
    if (!current) return;
    const name = editName().trim();
    const value = editValue();
    if (!name || !value) return;

    setEditSaving(true);
    setError(null);
    try {
      if (name !== current) {
        await deleteSecret(current);
      }
      await setSecret(name, value);
      closeEdit();
      await loadSecrets();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to save secret");
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div class="flex flex-col h-full p-6 overflow-auto">
      <div class="max-w-3xl mx-auto w-full space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-text-primary font-medium text-xl">Secrets Editor</h2>
            <p class="text-text-secondary text-sm">
              Manage encrypted secrets storage
            </p>
          </div>
          <button
            onClick={() => {
              closeEdit();
              setShowAddForm(true);
            }}
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
            Add Secret
          </button>
        </div>

        <Show when={error()}>
          <div class="bg-error/10 border border-error/30 rounded-lg p-3 text-error text-sm">
            {error()}
          </div>
        </Show>

        <Show when={showAddForm()}>
          <div class="bg-bg-secondary rounded-lg p-4 space-y-3">
            <h3 class="text-text-primary font-medium">Add New Secret</h3>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-text-secondary text-sm mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={newName()}
                  onInput={(e) => setNewName(e.currentTarget.value)}
                  placeholder="secret_name"
                  class="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label class="block text-text-secondary text-sm mb-1">
                  Value
                </label>
                <input
                  type="password"
                  value={newValue()}
                  onInput={(e) => setNewValue(e.currentTarget.value)}
                  placeholder="secret value"
                  class="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
                />
              </div>
            </div>
            <div class="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewName("");
                  setNewValue("");
                }}
                class="bg-bg-tertiary hover:bg-border text-text-primary font-medium py-2 px-4 rounded border border-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={adding() || !newName().trim() || !newValue()}
                class="bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
              >
                {adding() ? "Adding..." : "Add"}
              </button>
            </div>
          </div>
        </Show>

        <Show when={editingName()}>
          <div class="bg-bg-secondary rounded-lg p-4 space-y-3">
            <h3 class="text-text-primary font-medium">Edit Secret</h3>
            <Show
              when={!editLoading()}
              fallback={
                <div class="text-text-secondary text-sm py-2">
                  Loading secret value...
                </div>
              }
            >
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-text-secondary text-sm mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editName()}
                    onInput={(e) => setEditName(e.currentTarget.value)}
                    placeholder="secret_name"
                    class="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
                  />
                  <p class="text-text-tertiary text-xs mt-1">
                    Change name to rename the secret (old entry is removed).
                  </p>
                </div>
                <div>
                  <label class="block text-text-secondary text-sm mb-1">
                    Value
                  </label>
                  <input
                    type="password"
                    value={editValue()}
                    onInput={(e) => setEditValue(e.currentTarget.value)}
                    placeholder="secret value"
                    class="w-full bg-bg-tertiary border border-border rounded px-3 py-2 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
              <div class="flex gap-2 justify-end">
                <button
                  onClick={closeEdit}
                  class="bg-bg-tertiary hover:bg-border text-text-primary font-medium py-2 px-4 rounded border border-border transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={
                    editSaving() || !editName().trim() || !editValue()
                  }
                  class="bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
                >
                  {editSaving() ? "Saving..." : "Save"}
                </button>
              </div>
            </Show>
          </div>
        </Show>

        <div class="bg-bg-secondary rounded-lg overflow-hidden">
          <Show
            when={!loading()}
            fallback={
              <div class="p-8 text-center text-text-secondary">
                Loading secrets...
              </div>
            }
          >
            <Show
              when={secrets().length > 0}
              fallback={
                <div class="p-8 text-center text-text-secondary">
                  No secrets stored yet. Click "Add Secret" to create one.
                </div>
              }
            >
              <table class="w-full">
                <thead>
                  <tr class="border-b border-border">
                    <th class="text-left text-text-secondary text-sm font-medium px-4 py-3">
                      Name
                    </th>
                    <th class="text-left text-text-secondary text-sm font-medium px-4 py-3">
                      Value
                    </th>
                    <th class="text-right text-text-secondary text-sm font-medium px-4 py-3 w-24">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <For each={secrets()}>
                    {(secret) => (
                      <tr class="border-b border-border/50 last:border-b-0 hover:bg-bg-tertiary/50">
                        <td class="px-4 py-3 text-text-primary font-mono text-sm">
                          {secret.name}
                        </td>
                        <td class="px-4 py-3 text-text-secondary font-mono text-sm">
                          <Show
                            when={secret.visible && secret.value !== null}
                            fallback={
                              <span class="select-none">••••••••</span>
                            }
                          >
                            <span class="break-all">{secret.value}</span>
                          </Show>
                        </td>
                        <td class="px-4 py-3 text-right">
                          <div class="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(secret.name)}
                              disabled={editLoading()}
                              class="p-2 rounded hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                              title="Edit secret"
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
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() => toggleVisibility(secret.name)}
                              disabled={secret.loading}
                              class="p-2 rounded hover:bg-bg-tertiary text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                              title={secret.visible ? "Hide value" : "Show value"}
                            >
                              <Show
                                when={secret.visible}
                                fallback={
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
                                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                    />
                                    <path
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                      stroke-width="2"
                                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                    />
                                  </svg>
                                }
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
                                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                                  />
                                </svg>
                              </Show>
                            </button>
                            <Show
                              when={deleteConfirm() === secret.name}
                              fallback={
                                <button
                                  onClick={() => setDeleteConfirm(secret.name)}
                                  class="p-2 rounded hover:bg-error/20 text-text-secondary hover:text-error transition-colors"
                                  title="Delete secret"
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
                                onClick={() => handleDelete(secret.name)}
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
