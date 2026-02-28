import { createSignal, createEffect, untrack, onMount, onCleanup, For, Show } from "solid-js";
import * as monaco from "monaco-editor";
import { registerRhaiLanguage, RHAI_LANGUAGE_ID } from "../lib/rhaiMonaco";
import {
  listScripts,
  readScript,
  writeScript,
  deleteScript,
  renameScript,
  testScript,
} from "../lib/tauri";

const DEFAULT_CONTENT = "// Rhai script\nlet result = input;\nresult\n";

const DEFAULT_TEST_INPUT_JSON = `{
  "input1": "",
  "input2": "",
  "input3": "",
  "input4": "",
  "input5": ""
}`;

export function ScriptsView() {
  const [scriptNames, setScriptNames] = createSignal<string[]>([]);
  const [selectedName, setSelectedName] = createSignal<string | null>(null);
  const [currentContent, setCurrentContent] = createSignal<string>("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [editorContainer, setEditorContainer] = createSignal<HTMLDivElement | null>(null);
  let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;

  const [testEditorContainer, setTestEditorContainer] = createSignal<HTMLDivElement | null>(null);
  let testEditorInstance: monaco.editor.IStandaloneCodeEditor | null = null;

  registerRhaiLanguage();

  const [saving, setSaving] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);
  const [pendingSwitchTo, setPendingSwitchTo] = createSignal<string | null>(null);

  const [testModalOpen, setTestModalOpen] = createSignal(false);
  const [testInputJson, setTestInputJson] = createSignal(DEFAULT_TEST_INPUT_JSON);
  const [testRunning, setTestRunning] = createSignal(false);
  const [testError, setTestError] = createSignal<string | null>(null);

  const openTestModal = () => setTestModalOpen(true);
  const closeTestModal = () => {
    setTestModalOpen(false);
    setTestError(null);
  };

  createEffect(() => {
    const open = testModalOpen();
    const container = testEditorContainer();
    if (open && container) {
      const initialValue = untrack(() => testInputJson());
      testEditorInstance = monaco.editor.create(container, {
        value: initialValue,
        language: "json",
        theme: "vs-dark",
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: "on",
        roundedSelection: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: "on",
        padding: { top: 8 },
      });
      testEditorInstance.getModel()?.onDidChangeContent(() => {
        const value = testEditorInstance?.getModel()?.getValue() ?? DEFAULT_TEST_INPUT_JSON;
        setTestInputJson(value);
      });
      onCleanup(() => {
        testEditorInstance?.dispose();
        testEditorInstance = null;
      });
    }
  });

  const handleTestRun = async () => {
    const name = selectedName();
    if (!name) return;
    const raw = (testEditorInstance?.getModel()?.getValue() ?? testInputJson()).trim() || DEFAULT_TEST_INPUT_JSON;
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      setTestError("Invalid JSON");
      return;
    }
    setTestError(null);
    setTestRunning(true);
    try {
      await testScript(name, input);
      closeTestModal();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setTestError(err.message ?? "Script test failed");
    } finally {
      setTestRunning(false);
    }
  };

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
      setDirty(false);
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
    editorInstance.onDidChangeModelContent(() => {
      if (!editorInstance) return;
      const value = editorInstance.getModel()?.getValue() ?? "";
      setDirty(value !== currentContent());
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

  onMount(() => {
    loadScriptList();
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        handleSave();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  onCleanup(() => {
    if (editorInstance) {
      editorInstance.dispose();
      editorInstance = null;
    }
  });

  const switchToScript = async (name: string) => {
    setSelectedName(name);
    setDirty(false);
    setError(null);
    try {
      const content = await readScript(name);
      setCurrentContent(content);
      const container = editorContainer();
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

  const handleScriptSelect = async (name: string) => {
    const current = selectedName();
    if (current !== name && dirty()) {
      setPendingSwitchTo(name);
      return;
    }
    await switchToScript(name);
  };

  const handleSaveAndSwitch = async () => {
    const target = pendingSwitchTo();
    if (!target) return;
    await handleSave();
    setPendingSwitchTo(null);
    await switchToScript(target);
  };

  const handleDiscardAndSwitch = async () => {
    const target = pendingSwitchTo();
    if (!target) return;
    setPendingSwitchTo(null);
    setDirty(false);
    await switchToScript(target);
  };

  const handleEditorMount = (el: HTMLDivElement) => {
    setEditorContainer(el);
    const name = selectedName();
    const content = currentContent();
    // Create editor when we have a selected script (content may be "" before load or for empty script)
    if (name) {
      createEditor(el, content);
      setDirty(false);
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
      <Show when={pendingSwitchTo()}>
        {(target) => (
          <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            role="dialog"
            aria-labelledby="save-before-switch-title"
            aria-modal="true"
          >
            <div class="bg-bg-secondary border border-border rounded-lg shadow-xl p-4 max-w-sm w-full mx-4">
              <h2
                id="save-before-switch-title"
                class="text-text-primary font-medium text-base mb-2"
              >
                Unsaved changes
              </h2>
              <p class="text-text-secondary text-sm mb-4">
                Save changes to "{selectedName()}" before switching to "{target()}"?
              </p>
              <div class="flex justify-end gap-2 flex-nowrap">
                <button
                  type="button"
                  class="shrink-0 px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-border rounded text-text-primary transition-colors cursor-pointer"
                  onClick={() => setPendingSwitchTo(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="shrink-0 px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-border rounded text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                  onClick={handleDiscardAndSwitch}
                >
                  Discard and switch
                </button>
                <button
                  type="button"
                  class="shrink-0 px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded transition-colors cursor-pointer"
                  onClick={handleSaveAndSwitch}
                >
                  Save and switch
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
      <Show when={testModalOpen()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-labelledby="test-script-title"
          aria-modal="true"
        >
          <div class="bg-bg-secondary border border-border rounded-lg shadow-xl p-4 max-w-lg w-full mx-4">
            <h2
              id="test-script-title"
              class="text-text-primary font-medium text-base mb-2"
            >
              Test script
            </h2>
            <p class="text-text-secondary text-sm mb-2">
              JSON input (available as <code class="text-text-primary">input</code> in the script):
            </p>
            <div
              ref={setTestEditorContainer}
              class="w-full h-48 rounded-md border border-border overflow-hidden"
              aria-label="JSON input for script test"
            />
            <Show when={testError()}>
              <p class="text-error text-sm mb-2">{testError()}</p>
            </Show>
            <div class="flex justify-end gap-2 flex-nowrap mt-3">
              <button
                type="button"
                class="shrink-0 px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-border rounded text-text-primary transition-colors cursor-pointer"
                onClick={closeTestModal}
              >
                Cancel
              </button>
              <button
                type="button"
                class="shrink-0 px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded transition-colors cursor-pointer disabled:opacity-50"
                onClick={handleTestRun}
                disabled={testRunning()}
              >
                {testRunning() ? "Running…" : "Run test"}
              </button>
            </div>
          </div>
        </div>
      </Show>
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
            <div class="relative flex-1 min-h-0 flex flex-col">
              <div class="flex-1 min-h-0" ref={handleEditorMount} />
              <div class="absolute top-2 right-2 flex items-center gap-2 pointer-events-none">
                <div class="pointer-events-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving()}
                    class={`py-1.5 px-4 rounded-md disabled:opacity-50 text-sm font-medium transition-colors cursor-pointer shadow-lg ${
                      dirty()
                        ? "bg-accent hover:bg-accent-hover text-white"
                        : "bg-bg-tertiary hover:bg-border text-text-secondary"
                    }`}
                  >
                    {saving() ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={openTestModal}
                    class="shrink-0 py-1.5 px-4 rounded-md text-sm font-medium transition-colors cursor-pointer shadow-lg bg-success text-white hover:brightness-110"
                  >
                    Test
                  </button>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
