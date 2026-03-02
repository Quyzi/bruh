import {
  createSignal,
  onMount,
  onCleanup,
  Show,
} from "solid-js";
import * as monaco from "monaco-editor";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  readStartupSql,
  writeStartupSql,
  runStartupSql,
} from "../lib/tauri";
import { notifyGitRefresh } from "../lib/gitRefreshBus";

export function DatabaseView() {
  const [currentContent, setCurrentContent] = createSignal("");
  const [dirty, setDirty] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [running, setRunning] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [runSuccess, setRunSuccess] = createSignal(false);
  const [editorContainer, setEditorContainer] = createSignal<HTMLDivElement | null>(null);
  let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;

  const handleOpen = async () => {
    await openUrl("http://localhost:4213");
  };

  const loadStartupSql = async () => {
    setError(null);
    try {
      const content = await readStartupSql();
      setCurrentContent(content);
      const container = editorContainer();
      if (container) {
        if (editorInstance) {
          const model = editorInstance.getModel();
          if (model && model.getValue() !== content) {
            model.setValue(content);
          }
        } else {
          editorInstance = monaco.editor.create(container, {
            value: content,
            language: "sql",
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
          editorInstance.onDidChangeModelContent(() => {
            if (!editorInstance) return;
            const value = editorInstance.getModel()?.getValue() ?? "";
            setDirty(value !== currentContent());
            setRunSuccess(false);
          });
        }
        setDirty(false);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to load startup.sql");
    }
  };

  const handleSave = async () => {
    if (!editorInstance) return;
    const value = editorInstance.getModel()?.getValue() ?? "";
    setError(null);
    setSaving(true);
    try {
      await writeStartupSql(value);
      setCurrentContent(value);
      setDirty(false);
      notifyGitRefresh();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to save startup.sql");
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    if (!editorInstance) return;
    const value = editorInstance.getModel()?.getValue() ?? "";
    setError(null);
    setRunSuccess(false);
    setRunning(true);
    try {
      await runStartupSql(value);
      setRunSuccess(true);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to run SQL");
    } finally {
      setRunning(false);
    }
  };

  const handleEditorMount = (el: HTMLDivElement) => {
    setEditorContainer(el);
  };

  onMount(() => {
    loadStartupSql();
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

  return (
    <div class="flex flex-col h-full min-h-0">
      <div class="shrink-0 flex flex-col items-center py-4 px-4 border-b border-border bg-bg-secondary/50 gap-3">
        <div class="text-center space-y-1">
          <h2 class="text-text-primary font-medium text-xl">DuckDB Web UI</h2>
          <p class="text-text-secondary text-sm">
            Query and explore your database using DuckDB's built-in interface
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpen}
          class="bg-accent hover:bg-accent-hover text-white font-medium py-2.5 px-5 rounded-lg transition-colors flex items-center gap-2"
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
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          Open DuckDB UI
        </button>
        <p class="text-xs text-text-secondary/70">
          Opens in your default browser at localhost:4213
        </p>
      </div>

      <div class="flex-1 flex flex-col min-h-0 pt-2 px-2">
        <div class="shrink-0 flex items-center justify-between gap-2 mb-2">
          <h3 class="text-text-primary font-medium text-sm">SQL Startup Script</h3>
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRun}
              disabled={running()}
              class="shrink-0 py-1.5 px-4 rounded-md text-sm font-medium transition-colors cursor-pointer shadow-lg bg-success text-white hover:brightness-110 disabled:opacity-50"
            >
              {running() ? "Running…" : "Run"}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving()}
              class={`shrink-0 py-1.5 px-4 rounded-md text-sm font-medium transition-colors cursor-pointer shadow-lg disabled:opacity-50 ${
                dirty()
                  ? "bg-accent hover:bg-accent-hover text-white"
                  : "bg-bg-tertiary hover:bg-border text-text-secondary"
              }`}
            >
              {saving() ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <Show when={error()}>
          <div class="shrink-0 px-3 py-2 mb-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
            {error()}
          </div>
        </Show>
        <Show when={runSuccess()}>
          <div class="shrink-0 px-3 py-2 mb-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm">
            SQL ran successfully.
          </div>
        </Show>

        <div class="flex-1 min-h-0 rounded-md border border-border overflow-hidden" ref={handleEditorMount} />
      </div>
    </div>
  );
}
