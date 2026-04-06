import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { notifyGitRefresh } from "../lib/gitRefreshBus";
import * as monaco from "monaco-editor";
import {
  openOverlayWindow,
  closeOverlayWindow,
  getOverlayWindowState,
  listOverlayTemplates,
  readOverlayTemplate,
  writeOverlayTemplate,
  deleteOverlayTemplate,
  renameOverlayTemplate,
  listOverlayCss,
  readOverlayCss,
  writeOverlayCss,
  deleteOverlayCss,
} from "../lib/tauri";

const DEFAULT_TEMPLATE = `<div class="overlay">
  <div class="event" id="event">
    <span class="type">{{type}}</span>
    <span class="message">{{message}}</span>
  </div>
</div>`;

const DEFAULT_CSS = `.overlay {
  position: fixed;
  bottom: 20px;
  left: 20px;
  font-family: 'Segoe UI', sans-serif;
  pointer-events: none;
}

.event {
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 16px;
  animation: slideIn 0.3s ease-out;
}

.event .type {
  font-weight: bold;
  color: #9146ff;
  margin-right: 8px;
}

@keyframes slideIn {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}`;

type Tab = "template" | "css";

export function OverlayView() {
  const [tab, setTab] = createSignal<Tab>("template");
  
  const [templateNames, setTemplateNames] = createSignal<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = createSignal<string | null>(null);
  const [templateContent, setTemplateContent] = createSignal<string>("");
  
  const [cssNames, setCssNames] = createSignal<string[]>([]);
  const [selectedCss, setSelectedCss] = createSignal<string | null>(null);
  const [cssContent, setCssContent] = createSignal<string>("");
  
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [editorContainer, setEditorContainer] = createSignal<HTMLDivElement | null>(null);
  let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;

  const [saving, setSaving] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);
  const [pendingSwitchTo, setPendingSwitchTo] = createSignal<string | null>(null);

  const [overlayWindowOpen, setOverlayWindowOpen] = createSignal(false);

  const createEditor = (container: HTMLDivElement, initialContent: string, language: string) => {
    if (editorInstance) {
      editorInstance.dispose();
      editorInstance = null;
    }
    editorInstance = monaco.editor.create(container, {
      value: initialContent,
      language: language,
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
      if (tab() === "template") {
        setDirty(value !== templateContent());
      } else {
        setDirty(value !== cssContent());
      }
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

  const loadTemplateList = async () => {
    setLoading(true);
    setError(null);
    try {
      const names = await listOverlayTemplates();
      setTemplateNames(names);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  const loadCssList = async () => {
    setLoading(true);
    setError(null);
    try {
      const names = await listOverlayCss();
      setCssNames(names);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to load CSS files");
    } finally {
      setLoading(false);
    }
  };

  const loadOverlayWindowState = async () => {
    try {
      const state = await getOverlayWindowState();
      setOverlayWindowOpen(state);
    } catch (e: unknown) {
      console.error("Failed to get overlay window state:", e);
    }
  };

  onMount(() => {
    loadTemplateList();
    loadCssList();
    loadOverlayWindowState();
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        handleSave();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const unlistenRestore = listen("bruh://data-restored", () => {
      loadTemplateList();
      loadCssList();
    });
    onCleanup(() => {
      document.removeEventListener("keydown", onKeyDown);
      unlistenRestore.then((u) => u());
    });
  });

  onCleanup(() => {
    if (editorInstance) {
      editorInstance.dispose();
      editorInstance = null;
    }
  });

  const handleSave = async () => {
    if (!editorInstance) return;
    const value = editorInstance.getModel()?.getValue() ?? "";
    setError(null);
    setSaving(true);
    try {
      if (tab() === "template") {
        const name = selectedTemplate();
        if (!name) return;
        await writeOverlayTemplate(name, value);
        setTemplateContent(value);
      } else {
        const name = selectedCss();
        if (!name) return;
        await writeOverlayCss(name, value);
        setCssContent(value);
      }
      setDirty(false);
      notifyGitRefresh();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleEditorMount = (el: HTMLDivElement) => {
    setEditorContainer(el);
    const isTemplate = tab() === "template";
    const name = isTemplate ? selectedTemplate() : selectedCss();
    const content = isTemplate ? templateContent() : cssContent();
    if (name) {
      const language = isTemplate ? "html" : "css";
      createEditor(el, content, language);
      setDirty(false);
    }
  };

  const switchToTemplate = async (name: string) => {
    setSelectedTemplate(name);
    setSelectedCss(null);
    setTab("template");
    setDirty(false);
    setError(null);
    try {
      const content = await readOverlayTemplate(name);
      setTemplateContent(content);
      const container = editorContainer();
      if (container) {
        if (editorInstance) {
          updateEditorContent(content);
        } else {
          createEditor(container, content, "html");
        }
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to load template");
    }
  };

  const switchToCss = async (name: string) => {
    setSelectedCss(name);
    setSelectedTemplate(null);
    setTab("css");
    setDirty(false);
    setError(null);
    try {
      const content = await readOverlayCss(name);
      setCssContent(content);
      const container = editorContainer();
      if (container) {
        if (editorInstance) {
          updateEditorContent(content);
        } else {
          createEditor(container, content, "css");
        }
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to load CSS");
    }
  };

  const handleTemplateSelect = async (name: string) => {
    const current = selectedTemplate();
    if (current !== name && dirty()) {
      setPendingSwitchTo(name);
      return;
    }
    await switchToTemplate(name);
  };

  const handleCssSelect = async (name: string) => {
    const current = selectedCss();
    if (current !== name && dirty()) {
      setPendingSwitchTo(name);
      return;
    }
    await switchToCss(name);
  };

  const handleSaveAndSwitch = async () => {
    const target = pendingSwitchTo();
    if (!target) return;
    await handleSave();
    setPendingSwitchTo(null);
    if (tab() === "template") {
      await switchToTemplate(target);
    } else {
      await switchToCss(target);
    }
  };

  const handleDiscardAndSwitch = async () => {
    const target = pendingSwitchTo();
    if (!target) return;
    setPendingSwitchTo(null);
    setDirty(false);
    if (tab() === "template") {
      await switchToTemplate(target);
    } else {
      await switchToCss(target);
    }
  };

  const handleNewTemplate = async () => {
    const name = prompt("Template name:", "Untitled")?.trim() || "Untitled";
    if (!name) return;
    setError(null);
    try {
      await writeOverlayTemplate(name, DEFAULT_TEMPLATE);
      notifyGitRefresh();
      await loadTemplateList();
      setSelectedTemplate(name);
      setTemplateContent(DEFAULT_TEMPLATE);
      handleTemplateSelect(name);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to create template");
    }
  };

  const handleNewCss = async () => {
    const name = prompt("CSS name:", "Untitled")?.trim() || "Untitled";
    if (!name) return;
    setError(null);
    try {
      await writeOverlayCss(name, DEFAULT_CSS);
      notifyGitRefresh();
      await loadCssList();
      setSelectedCss(name);
      setCssContent(DEFAULT_CSS);
      handleCssSelect(name);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to create CSS");
    }
  };

  const handleDeleteTemplate = async (e: MouseEvent, name: string) => {
    e.stopPropagation();
    if (!confirm("Delete this template?")) return;
    setError(null);
    try {
      await deleteOverlayTemplate(name);
      notifyGitRefresh();
      await loadTemplateList();
      if (selectedTemplate() === name) {
        setSelectedTemplate(null);
        setTemplateContent("");
        if (editorInstance) {
          editorInstance.getModel()?.setValue("");
        }
      }
    } catch (err: unknown) {
      const ex = err as { message?: string };
      setError(ex.message ?? "Failed to delete template");
    }
  };

  const handleDeleteCss = async (e: MouseEvent, name: string) => {
    e.stopPropagation();
    if (!confirm("Delete this CSS?")) return;
    setError(null);
    try {
      await deleteOverlayCss(name);
      notifyGitRefresh();
      await loadCssList();
      if (selectedCss() === name) {
        setSelectedCss(null);
        setCssContent("");
        if (editorInstance) {
          editorInstance.getModel()?.setValue("");
        }
      }
    } catch (err: unknown) {
      const ex = err as { message?: string };
      setError(ex.message ?? "Failed to delete CSS");
    }
  };

  const handleRenameTemplate = async (name: string) => {
    const newName = prompt("Rename template:", name)?.trim();
    if (!newName || newName === name) return;
    setError(null);
    try {
      await renameOverlayTemplate(name, newName);
      notifyGitRefresh();
      await loadTemplateList();
      if (selectedTemplate() === name) {
        setSelectedTemplate(newName);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to rename template");
    }
  };

  const handleRenameCss = async (name: string) => {
    const newName = prompt("Rename CSS:", name)?.trim();
    if (!newName || newName === name) return;
    setError(null);
    try {
      await renameOverlayTemplate(name, newName);
      notifyGitRefresh();
      await loadCssList();
      if (selectedCss() === name) {
        setSelectedCss(newName);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to rename CSS");
    }
  };

  const handleToggleOverlayWindow = async () => {
    try {
      if (overlayWindowOpen()) {
        await closeOverlayWindow();
        setOverlayWindowOpen(false);
      } else {
        await openOverlayWindow();
        setOverlayWindowOpen(true);
      }
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to toggle overlay window");
    }
  };

  const handleTabChange = (newTab: Tab) => {
    const current = tab();
    if (current === newTab) return;
    
    if (dirty()) {
      setPendingSwitchTo(newTab);
      return;
    }
    
    setTab(newTab);
    if (newTab === "template" && selectedTemplate()) {
      const content = templateContent();
      const container = editorContainer();
      if (container) {
        if (editorInstance) {
          updateEditorContent(content);
        } else {
          createEditor(container, content, "html");
        }
      }
    } else if (newTab === "css" && selectedCss()) {
      const content = cssContent();
      const container = editorContainer();
      if (container) {
        if (editorInstance) {
          updateEditorContent(content);
        } else {
          createEditor(container, content, "css");
        }
      }
    }
    setDirty(false);
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
                Save changes before switching to {target()}?
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
      <Show when={error()}>
        <div class="px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm">
          {error()}
        </div>
      </Show>
      <div class="flex items-center gap-4 px-4 py-3 border-b border-border bg-bg-secondary">
        <div class="flex gap-1">
          <button
            type="button"
            onClick={() => handleTabChange("template")}
            class={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              tab() === "template"
                ? "bg-accent text-white"
                : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
            }`}
          >
            Templates
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("css")}
            class={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              tab() === "css"
                ? "bg-accent text-white"
                : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
            }`}
          >
            CSS
          </button>
        </div>
        <button
          type="button"
          onClick={handleToggleOverlayWindow}
          class={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${
            overlayWindowOpen()
              ? "bg-success text-white"
              : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
          }`}
        >
          {overlayWindowOpen() ? "Close Overlay" : "Open Overlay"}
        </button>
      </div>
      <div class="flex flex-1 min-h-0">
        <aside class="w-56 shrink-0 border-r border-border bg-bg-secondary flex flex-col">
          <div class="p-2 border-b border-border">
            <button
              type="button"
              onClick={tab() === "template" ? handleNewTemplate : handleNewCss}
              disabled={loading()}
              class="w-full py-2 px-3 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              + New {tab() === "template" ? "Template" : "CSS"}
            </button>
          </div>
          <ul class="flex-1 overflow-y-auto p-2 space-y-1">
            <Show
              when={!loading()}
              fallback={<li class="text-text-tertiary text-sm py-2">Loading…</li>}
            >
              <Show when={tab() === "template"}>
                <For each={templateNames()}>
                  {(name) => (
                    <li
                      class={`group flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                        selectedTemplate() === name
                          ? "bg-accent/20 text-accent"
                          : "hover:bg-bg-tertiary text-text-secondary hover:text-text-primary"
                      }`}
                      onClick={() => handleTemplateSelect(name)}
                    >
                      <span
                        class="flex-1 truncate text-sm"
                        title={name}
                        onDblClick={() => handleRenameTemplate(name)}
                      >
                        {name}
                      </span>
                      <button
                        type="button"
                        class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-text-tertiary hover:text-red-400 text-xs transition-opacity cursor-pointer"
                        onClick={(ev) => handleDeleteTemplate(ev, name)}
                        title="Delete template"
                      >
                        ×
                      </button>
                    </li>
                  )}
                </For>
              </Show>
              <Show when={tab() === "css"}>
                <For each={cssNames()}>
                  {(name) => (
                    <li
                      class={`group flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                        selectedCss() === name
                          ? "bg-accent/20 text-accent"
                          : "hover:bg-bg-tertiary text-text-secondary hover:text-text-primary"
                      }`}
                      onClick={() => handleCssSelect(name)}
                    >
                      <span
                        class="flex-1 truncate text-sm"
                        title={name}
                        onDblClick={() => handleRenameCss(name)}
                      >
                        {name}
                      </span>
                      <button
                        type="button"
                        class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/20 text-text-tertiary hover:text-red-400 text-xs transition-opacity cursor-pointer"
                        onClick={(ev) => handleDeleteCss(ev, name)}
                        title="Delete CSS"
                      >
                        ×
                      </button>
                    </li>
                  )}
                </For>
              </Show>
            </Show>
          </ul>
        </aside>
        <div class="flex-1 flex flex-col min-h-0">
          <Show
            when={(tab() === "template" && selectedTemplate()) || (tab() === "css" && selectedCss())}
            fallback={
              <div class="flex-1 flex items-center justify-center text-text-tertiary text-sm">
                Select a {tab() === "template" ? "template" : "CSS file"} or create a new one
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
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}