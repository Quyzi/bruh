import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import * as monaco from "monaco-editor";
import { registerRhaiLanguage, RHAI_LANGUAGE_ID } from "../lib/rhaiMonaco";
import {
  listScripts,
  readScript,
  writeScript,
  deleteScript,
  renameScript,
} from "../lib/tauri";

const DEFAULT_CONTENT = "// Rhai script\nlet result = input;\nresult\n";

export function ScriptsView() {
  const [scriptNames, setScriptNames] = createSignal<string[]>([]);
  const [selectedName, setSelectedName] = createSignal<string | null>(null);
  const [currentContent, setCurrentContent] = createSignal<string>("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [editorContainer, setEditorContainer] = createSignal<HTMLDivElement | null>(null);
  let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;

  registerRhaiLanguage();

  const [saving, setSaving] = createSignal(false);

  const handleSave = async () => {
    if (!editorInstance) return;
    const name = selectedName();
    if (!name) return;
    const value = editorInstance.getModel()?.getValue() ?? "";
    setError(null);
    setSaving(true);
    try {
      await writeScript(name, value);
      setCurrentContent(value);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to save script");
    } finally {
      setSaving(false);
    }
  };

  const createEditor = (container: HTMLDivElement, initialContent: string) => {
    if (editorInstance) {
      editorInstance.dispose();
      editorInstance = null;
    }
    editorInstance = monaco.editor.create(container, {
      value: initialContent,
      language: RHAI_LANGUAGE_ID,
      theme: "vs-dark",
      minimap: { enabled: false },
      fontSize: 14,
      lineNumbers: "on",
      roundedSelection: true,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: "on",
    });
    return editorInstance;
  };

  const updateEditorContent = (content: string) => {
    if (editorInstance) {
      const model = editorInstance.getModel();
      if (model && model.getValue() !== content) {
        model.setValue(content);
      }
    }
  };

  const loadScriptList = async () => {
    setLoading(true);
    setError(null);
    try {
      const names = await listScripts();
      setScriptNames(names);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to load scripts");
    } finally {
      setLoading(false);
    }
  };

  onMount(loadScriptList);

  onCleanup(() => {
    if (editorInstance) {
      editorInstance.dispose();
      editorInstance = null;
    }
  });

  const handleScriptSelect = async (name: string) => {
    const container = editorContainer();
    setSelectedName(name);
    setError(null);
    try {
      const content = await readScript(name);
      setCurrentContent(content);
      if (container) {
        if (editorInstance) {
          updateEditorContent(content);
        } else {
          createEditor(container, content);
        }
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to load script");
    }
  };

  const handleEditorMount = (el: HTMLDivElement) => {
    setEditorContainer(el);
    const name = selectedName();
    const content = currentContent();
    if (name && content) {
      createEditor(el, content);
    }
  };

  const handleNewScript = async () => {
    const name = prompt("Script name:", "Untitled")?.trim() || "Untitled";
    if (!name) return;
    setError(null);
    try {
      await writeScript(name, DEFAULT_CONTENT);
      await loadScriptList();
      setSelectedName(name);
      setCurrentContent(DEFAULT_CONTENT);
      handleScriptSelect(name);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to create script");
    }
  };

  const handleDeleteScript = async (e: MouseEvent, name: string) => {
    e.stopPropagation();
    if (!confirm("Delete this script?")) return;
    setError(null);
    try {
      await deleteScript(name);
      await loadScriptList();
      if (selectedName() === name) {
        setSelectedName(null);
        setCurrentContent("");
        if (editorInstance) {
          editorInstance.getModel()?.setValue("");
        }
      }
    } catch (err: unknown) {
      const ex = err as { message?: string };
      setError(ex.message ?? "Failed to delete script");
    }
  };

  const handleRenameScript = async (name: string) => {
    const newName = prompt("Rename script:", name)?.trim();
    if (!newName || newName === name) return;
    setError(null);
    try {
      await renameScript(name, newName);
      await loadScriptList();
      if (selectedName() === name) {
        setSelectedName(newName);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to rename script");
    }
  };

  return (
    <div class="flex flex-col h-full">
      <Show when={error()}>
        <div class="px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm">
          {error()}
        </div>
      </Show>
      <div class="flex flex-1 min-h-0">
        <aside class="w-56 shrink-0 border-r border-border bg-bg-secondary flex flex-col">
          <div class="p-2 border-b border-border">
            <button
              type="button"
              onClick={handleNewScript}
              disabled={loading()}
              class="w-full py-2 px-3 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              + New Script
            </button>
          </div>
          <ul class="flex-1 overflow-y-auto p-2 space-y-1">
            <Show
              when={!loading()}
              fallback={<li class="text-text-tertiary text-sm py-2">Loading…</li>}
            >
              <For each={scriptNames()}>
                {(name) => (
                  <li
                    class={`group flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                      selectedName() === name
                        ? "bg-accent/20 text-accent"
                        : "hover:bg-bg-tertiary text-text-secondary hover:text-text-primary"
                    }`}
                    onClick={() => handleScriptSelect(name)}
                  >
                    <span
                      class="flex-1 truncate text-sm"
                      title={name}
                      onDblClick={() => handleRenameScript(name)}
                    >
                      {name}
                    </span>
                    <button
                      type="button"
                      class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-text-tertiary hover:text-red-400 text-xs transition-opacity cursor-pointer"
                      onClick={(ev) => handleDeleteScript(ev, name)}
                      title="Delete script"
                    >
                      ×
                    </button>
                  </li>
                )}
              </For>
            </Show>
          </ul>
        </aside>
        <div class="flex-1 flex flex-col min-w-0">
          <Show
            when={selectedName()}
            fallback={
              <div class="flex-1 flex items-center justify-center text-text-tertiary text-sm">
                Select a script or create a new one
              </div>
            }
          >
            <div class="flex flex-col flex-1 min-h-0">
              <div class="shrink-0 flex justify-end px-2 py-2 border-b border-border bg-bg-secondary">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving()}
                  class="py-1.5 px-4 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium transition-colors cursor-pointer"
                >
                  {saving() ? "Saving…" : "Save"}
                </button>
              </div>
              <div class="flex-1 min-h-0" ref={handleEditorMount} />
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
