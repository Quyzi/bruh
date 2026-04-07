import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { notifyGitRefresh } from "../lib/gitRefreshBus";
import * as monaco from "monaco-editor";

const JINJA_LANG_ID = "jinja2";

if (!monaco.languages.getLanguages().some((l) => l.id === JINJA_LANG_ID)) {
  monaco.languages.register({ id: JINJA_LANG_ID });
  monaco.languages.setMonarchTokensProvider(JINJA_LANG_ID, {
    tokenizer: {
      root: [
        [/\{\{/, { token: "delimiter.jinja", next: "@jinjaExpr" }],
        [/\{%/, { token: "delimiter.jinja", next: "@jinjaBlock" }],
        [/\{#/, { token: "comment.jinja", next: "@jinjaComment" }],
        [/<\/[a-zA-Z][\w]*\s*>/, "tag"],
        [/<[a-zA-Z][\w]*/, { token: "tag", next: "@htmlTag" }],
        [/<!--/, { token: "comment.html", next: "@htmlComment" }],
        [/[^<{]+/, ""],
      ],
      jinjaExpr: [
        [/\}\}/, { token: "delimiter.jinja", next: "@pop" }],
        [/[a-zA-Z_]\w*/, "variable.jinja"],
        [/[|.]/, "delimiter.jinja"],
        [/./, "string.jinja"],
      ],
      jinjaBlock: [
        [/%\}/, { token: "delimiter.jinja", next: "@pop" }],
        [/\b(if|else|elif|endif|for|endfor|block|endblock|extends|include|macro|endmacro|call|endcall|filter|endfilter|set|do|not|and|or|in|is|import|from|as|with|without|context|true|false|none|loop|super)\b/, "keyword.jinja"],
        [/[a-zA-Z_]\w*/, "variable.jinja"],
        [/./, "string.jinja"],
      ],
      jinjaComment: [
        [/#\}/, { token: "comment.jinja", next: "@pop" }],
        [/./, "comment.jinja"],
      ],
      htmlTag: [
        [/>/, { token: "tag", next: "@pop" }],
        [/\{\{/, { token: "delimiter.jinja", next: "@jinjaExpr" }],
        [/[a-zA-Z_][\w-]*/, "attribute.name"],
        [/=/, "delimiter"],
        [/"[^"]*"/, "attribute.value"],
        [/'[^']*'/, "attribute.value"],
        [/[^>{]+/, ""],
      ],
      htmlComment: [
        [/-->/, { token: "comment.html", next: "@pop" }],
        [/./, "comment.html"],
      ],
    },
  } as monaco.languages.IMonarchLanguage);
}

import {
  listOverlayTemplates,
  readOverlayTemplate,
  writeOverlayTemplate,
  deleteOverlayTemplate,
  renameOverlayTemplate,
} from "../lib/tauri";

async function fetchDefaultTemplate(): Promise<string> {
  const res = await fetch("/templates/overlay_template.jinja");
  if (!res.ok) throw new Error("Failed to load default template");
  return res.text();
}

export function OverlayView() {
  const [templateNames, setTemplateNames] = createSignal<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = createSignal<string | null>(null);
  const [templateContent, setTemplateContent] = createSignal<string>("");

  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [editorContainer, setEditorContainer] = createSignal<HTMLDivElement | null>(null);
  let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null;

  const [saving, setSaving] = createSignal(false);
  const [dirty, setDirty] = createSignal(false);
  const [pendingSwitchTo, setPendingSwitchTo] = createSignal<string | null>(null);
  const [showPreview, setShowPreview] = createSignal(false);
  const [previewHtml, setPreviewHtml] = createSignal("");
  let previewDebounce: ReturnType<typeof setTimeout> | null = null;

  const createEditor = (container: HTMLDivElement, initialContent: string) => {
    if (editorInstance) {
      editorInstance.dispose();
      editorInstance = null;
    }
    editorInstance = monaco.editor.create(container, {
      value: initialContent,
      language: JINJA_LANG_ID,
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
      setDirty(value !== templateContent());
      if (showPreview()) {
        if (previewDebounce) clearTimeout(previewDebounce);
        previewDebounce = setTimeout(() => setPreviewHtml(value), 300);
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

  onMount(() => {
    loadTemplateList();
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        handleSave();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const unlistenRestore = listen("bruh://data-restored", () => {
      loadTemplateList();
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
    const name = selectedTemplate();
    if (!name) return;
    const value = editorInstance.getModel()?.getValue() ?? "";
    setError(null);
    setSaving(true);
    try {
      await writeOverlayTemplate(name, value);
      setTemplateContent(value);
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
    const name = selectedTemplate();
    const content = templateContent();
    if (name) {
      createEditor(el, content);
      setDirty(false);
    }
  };

  const switchToTemplate = async (name: string) => {
    setSelectedTemplate(name);
    setDirty(false);
    setError(null);
    try {
      const content = await readOverlayTemplate(name);
      setTemplateContent(content);
      setPreviewHtml(content);
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
      setError(err.message ?? "Failed to load template");
    }
  };

  const handleTemplateSelect = async (name: string) => {
    if (selectedTemplate() !== name && dirty()) {
      setPendingSwitchTo(name);
      return;
    }
    await switchToTemplate(name);
  };

  const handleSaveAndSwitch = async () => {
    const target = pendingSwitchTo();
    if (!target) return;
    await handleSave();
    setPendingSwitchTo(null);
    await switchToTemplate(target);
  };

  const handleDiscardAndSwitch = async () => {
    const target = pendingSwitchTo();
    if (!target) return;
    setPendingSwitchTo(null);
    setDirty(false);
    await switchToTemplate(target);
  };

  const handleNewTemplate = async () => {
    const name = prompt("Template name:", "Untitled")?.trim() || "Untitled";
    if (!name) return;
    setError(null);
    try {
      const content = await fetchDefaultTemplate();
      await writeOverlayTemplate(name, content);
      notifyGitRefresh();
      await loadTemplateList();
      await switchToTemplate(name);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to create template");
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
      <div class="flex flex-1 min-h-0">
        <aside class="w-56 shrink-0 border-r border-border bg-bg-secondary flex flex-col">
          <div class="p-2 border-b border-border">
            <button
              type="button"
              onClick={handleNewTemplate}
              disabled={loading()}
              class="w-full py-2 px-3 rounded-md bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              + New Template
            </button>
          </div>
          <ul class="flex-1 overflow-y-auto p-2 space-y-1">
            <Show
              when={!loading()}
              fallback={<li class="text-text-tertiary text-sm py-2">Loading…</li>}
            >
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
          </ul>
        </aside>
        <div class="flex-1 flex flex-col min-h-0">
          <Show
            when={selectedTemplate()}
            fallback={
              <div class="flex-1 flex items-center justify-center text-text-tertiary text-sm">
                Select a template or create a new one
              </div>
            }
          >
            <div class="flex flex-1 min-h-0">
              <div
                class="relative min-h-0 flex flex-col"
                classList={{ "flex-1": !showPreview(), "w-1/2": showPreview() }}
              >
                <div class="flex-1 min-h-0" ref={handleEditorMount} />
                <div class="absolute top-2 right-2 flex items-center gap-2 pointer-events-none">
                  <div class="pointer-events-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !showPreview();
                        setShowPreview(next);
                        if (next) {
                          const value = editorInstance?.getModel()?.getValue() ?? templateContent();
                          setPreviewHtml(value);
                        }
                      }}
                      class={`py-1.5 px-4 rounded-md text-sm font-medium transition-colors cursor-pointer shadow-lg ${
                        showPreview()
                          ? "bg-success text-white"
                          : "bg-bg-tertiary hover:bg-border text-text-secondary"
                      }`}
                    >
                      Test
                    </button>
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
              <div
                class="min-h-0 border-l border-border overflow-hidden bg-[#1a1a1a]"
                classList={{ "w-0": !showPreview(), "w-1/2": showPreview() }}
              >
                <iframe
                  srcdoc={previewHtml()}
                  class="w-full h-full border-none"
                  title="Template preview"
                />
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
