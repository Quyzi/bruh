import {
  createSignal,
  createEffect,
  on,
  onMount,
  onCleanup,
  Show,
  For,
} from "solid-js";
import * as monaco from "monaco-editor";
import { listen } from "@tauri-apps/api/event";
import {
  gitGetStatus,
  gitGetDiff,
  gitCommit,
  gitReset,
  gitCheckoutRevision,
  type CommitInfo,
  type GitStatusResult,
} from "../lib/tauri";
import { gitRefreshSignal } from "../lib/gitRefreshBus";

function formatTimestamp(seconds: number): string {
  const d = new Date(seconds * 1000);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultCommitMessage(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return `Bruh Snapshot ${date} ${time}`;
}

// ---------------------------------------------------------------------------
// DiffViewer — read-only Monaco editor with line-level background decorations
// ---------------------------------------------------------------------------

const DIFF_STYLE_ID = "bruh-diff-viewer-styles";

function ensureDiffStyles() {
  if (document.getElementById(DIFF_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = DIFF_STYLE_ID;
  style.textContent = `
    .diff-line-added   { background-color: rgba(70, 210, 100, 0.15) !important; border-left: 2px solid rgba(70, 210, 100, 0.6); }
    .diff-line-removed { background-color: rgba(255, 80,  80,  0.15) !important; border-left: 2px solid rgba(255, 80, 80, 0.6); }
    .diff-line-hunk    { background-color: rgba(100, 160, 255, 0.08) !important; }
    .diff-line-header  { background-color: rgba(180, 180, 180, 0.06) !important; }
  `;
  document.head.appendChild(style);
}

function applyDiffDecorations(editor: monaco.editor.IStandaloneCodeEditor) {
  const model = editor.getModel();
  if (!model) return;
  const lines = model.getLinesContent();
  const decorations: monaco.editor.IModelDeltaDecoration[] = lines.flatMap((line, i) => {
    const lineNum = i + 1;
    if (line.startsWith("+++") || line.startsWith("---")) {
      return [{ range: new monaco.Range(lineNum, 1, lineNum, 1), options: { isWholeLine: true, className: "diff-line-header" } }];
    }
    if (line.startsWith("+")) {
      return [{ range: new monaco.Range(lineNum, 1, lineNum, 1), options: { isWholeLine: true, className: "diff-line-added" } }];
    }
    if (line.startsWith("-")) {
      return [{ range: new monaco.Range(lineNum, 1, lineNum, 1), options: { isWholeLine: true, className: "diff-line-removed" } }];
    }
    if (line.startsWith("@@")) {
      return [{ range: new monaco.Range(lineNum, 1, lineNum, 1), options: { isWholeLine: true, className: "diff-line-hunk" } }];
    }
    return [];
  });
  editor.createDecorationsCollection(decorations);
}

function DiffViewer(props: { content: string }) {
  let container!: HTMLDivElement;
  let editor: monaco.editor.IStandaloneCodeEditor | null = null;

  onMount(() => {
    ensureDiffStyles();
    editor = monaco.editor.create(container, {
      value: props.content || "(no changes)",
      language: "diff",
      theme: "vs-dark",
      readOnly: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      lineNumbers: "off",
      folding: false,
      renderLineHighlight: "none",
      fontSize: 12,
      wordWrap: "on",
      scrollbar: { verticalScrollbarSize: 8 },
    });
    if (props.content) applyDiffDecorations(editor);
  });

  createEffect(() => {
    const value = props.content || "(no changes)";
    const model = editor?.getModel();
    if (!model || !editor) return;
    if (model.getValue() !== value) {
      model.setValue(value);
    }
    if (props.content) applyDiffDecorations(editor);
  });

  onCleanup(() => {
    editor?.dispose();
    editor = null;
  });

  return <div ref={container} style={{ height: "320px" }} class="rounded overflow-hidden border border-border" />;
}

// ---------------------------------------------------------------------------
// GitControls
// ---------------------------------------------------------------------------

export function GitControls() {
  const [status, setStatus] = createSignal<GitStatusResult | null>(null);
  const [activeHash, setActiveHash] = createSignal<string | null>(null);
  const [showDropdown, setShowDropdown] = createSignal(false);
  const [showCommitDialog, setShowCommitDialog] = createSignal(false);
  const [showResetDialog, setShowResetDialog] = createSignal(false);
  const [commitMessage, setCommitMessage] = createSignal("");
  const [diffContent, setDiffContent] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [diffLoading, setDiffLoading] = createSignal(false);

  const dirty = () => status()?.dirty ?? false;
  const commits = () => status()?.commits ?? [];
  const headCommit = () => commits().find((c) => c.isHead) ?? null;

  const refresh = async () => {
    try {
      const s = await gitGetStatus();
      setStatus(s);
      if (activeHash() === null) {
        const head = s.commits.find((c) => c.isHead);
        if (head) setActiveHash(head.hash);
      }
    } catch {
      // Silently ignore — git may not be available yet
    }
  };

  createEffect(on(gitRefreshSignal, () => refresh(), { defer: true }));

  onMount(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    const unlistenPromise = listen("bruh://data-restored", () => refresh());
    onCleanup(() => {
      clearInterval(interval);
      unlistenPromise.then((u) => u());
    });
  });

  const handleDocClick = (e: MouseEvent) => {
    const target = e.target as Element;
    if (!target.closest("[data-git-dropdown]")) {
      setShowDropdown(false);
    }
  };

  onMount(() => {
    document.addEventListener("mousedown", handleDocClick);
    onCleanup(() => document.removeEventListener("mousedown", handleDocClick));
  });

  const loadDiff = async () => {
    setDiffLoading(true);
    try {
      const diff = await gitGetDiff();
      setDiffContent(diff);
    } catch {
      setDiffContent("(failed to load diff)");
    } finally {
      setDiffLoading(false);
    }
  };

  const openCommitDialog = async () => {
    setCommitMessage(defaultCommitMessage());
    setDiffContent("");
    setShowCommitDialog(true);
    await loadDiff();
  };

  const openResetDialog = async () => {
    if (!dirty() || loading()) return;
    setDiffContent("");
    setShowResetDialog(true);
    await loadDiff();
  };

  const handleCommit = async () => {
    if (loading()) return;
    const msg = commitMessage().trim() || defaultCommitMessage();
    setLoading(true);
    setShowCommitDialog(false);
    try {
      await gitCommit(msg);
      await refresh();
      const head = status()?.commits.find((c) => c.isHead);
      if (head) setActiveHash(head.hash);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (loading()) return;
    setLoading(true);
    setShowResetDialog(false);
    try {
      await gitReset();
      await refresh();
      const head = status()?.commits.find((c) => c.isHead);
      if (head) setActiveHash(head.hash);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (commit: CommitInfo) => {
    if (loading() || commit.hash === activeHash()) return;
    setShowDropdown(false);
    setLoading(true);
    try {
      await gitCheckoutRevision(commit.fullHash);
      setActiveHash(commit.hash);
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div class="flex items-center gap-1" data-git-dropdown>
        {/* Revision dropdown trigger */}
        <div class="relative">
          <button
            type="button"
            onClick={() => setShowDropdown((v) => !v)}
            disabled={loading()}
            class="h-6 px-2 rounded text-xs font-mono font-medium bg-bg-tertiary hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed border border-border transition-colors cursor-pointer flex items-center gap-1"
            classList={{
              "text-amber-400": activeHash() !== null && activeHash() !== headCommit()?.hash,
              "text-text-secondary": activeHash() === null || activeHash() === headCommit()?.hash,
            }}
          >
            <span>{activeHash() ?? headCommit()?.hash ?? "no commits"}</span>
            <span class="opacity-60">▾</span>
          </button>

          <Show when={showDropdown() && commits().length > 0}>
            <div class="absolute right-0 top-full mt-1 z-50 min-w-64 max-w-xs bg-bg-secondary border border-border rounded shadow-lg overflow-hidden">
              <div class="max-h-60 overflow-y-auto">
                <For each={commits()}>
                  {(commit) => {
                    const isActive = () => commit.hash === activeHash();
                    const isHead = commit.isHead;
                    const isActiveOnly = () => isActive() && !isHead;
                    return (
                      <button
                        type="button"
                        onClick={() => handleCheckout(commit)}
                        disabled={isActive() || loading()}
                        class="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-bg-tertiary disabled:cursor-default transition-colors"
                        classList={{ "bg-bg-tertiary": isHead || isActive() }}
                      >
                        <span
                          class="mt-1 w-1.5 h-1.5 rounded-full shrink-0 flex-none"
                          classList={{
                            "bg-accent": isHead && !isActiveOnly(),
                            "bg-amber-400": isActiveOnly(),
                            "bg-transparent": !isHead && !isActive(),
                          }}
                        />
                        <span class="flex flex-col min-w-0">
                          <span class="font-mono text-xs flex items-center gap-1.5">
                            <span
                              classList={{
                                "text-accent font-semibold": isHead,
                                "text-amber-400 font-semibold": isActiveOnly(),
                                "text-text-secondary": !isHead && !isActiveOnly(),
                              }}
                            >
                              {commit.hash}
                            </span>
                            <Show when={isHead}>
                              <span class="text-accent opacity-70 text-[10px]">HEAD</span>
                            </Show>
                            <Show when={isActiveOnly()}>
                              <span class="text-amber-400 opacity-80 text-[10px]">active</span>
                            </Show>
                          </span>
                          <span class="text-xs text-text-primary truncate">{commit.message}</span>
                          <span class="text-xs text-text-secondary">{formatTimestamp(commit.timestamp)}</span>
                        </span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>
        </div>

        {/* Reset button */}
        <button
          type="button"
          disabled={!dirty() || loading()}
          onClick={openResetDialog}
          class="h-6 px-2 rounded text-xs font-medium transition-colors cursor-pointer border"
          classList={{
            "bg-red-600 hover:bg-red-700 text-white border-red-700": dirty() && !loading(),
            "bg-bg-tertiary text-text-secondary border-border opacity-50 cursor-not-allowed":
              !dirty() || loading(),
          }}
          title="Discard uncommitted changes"
        >
          Reset
        </button>

        {/* Commit button */}
        <button
          type="button"
          disabled={!dirty() || loading()}
          onClick={openCommitDialog}
          class="h-6 px-2 rounded text-xs font-medium transition-colors cursor-pointer border"
          classList={{
            "bg-success hover:bg-success/80 text-white border-success/80": dirty() && !loading(),
            "bg-bg-tertiary text-text-secondary border-border opacity-50 cursor-not-allowed":
              !dirty() || loading(),
          }}
          title="Commit current changes"
        >
          Commit
        </button>
      </div>

      {/* Commit dialog */}
      <Show when={showCommitDialog()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowCommitDialog(false);
          }}
        >
          <div class="bg-bg-secondary border border-border rounded-lg shadow-xl p-4 flex flex-col gap-3 w-[680px] max-w-[95vw]">
            <p class="text-sm font-medium text-text-primary">Commit changes</p>
            <input
              type="text"
              value={commitMessage()}
              onInput={(e) => setCommitMessage(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCommit();
                if (e.key === "Escape") setShowCommitDialog(false);
              }}
              class="w-full px-2 py-1.5 rounded bg-bg-primary border border-border text-sm text-text-primary focus:outline-none focus:border-accent"
              placeholder={defaultCommitMessage()}
              autofocus
            />
            <Show
              when={!diffLoading()}
              fallback={
                <div class="h-[320px] rounded border border-border bg-bg-primary flex items-center justify-center text-text-tertiary text-xs">
                  Loading diff…
                </div>
              }
            >
              <DiffViewer content={diffContent()} />
            </Show>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCommitDialog(false)}
                class="h-7 px-3 rounded text-xs font-medium bg-bg-tertiary hover:bg-border text-text-primary border border-border transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommit}
                class="h-7 px-3 rounded text-xs font-medium bg-success hover:bg-success/80 text-white transition-colors cursor-pointer"
              >
                Commit
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Reset confirmation dialog */}
      <Show when={showResetDialog()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowResetDialog(false);
          }}
        >
          <div class="bg-bg-secondary border border-border rounded-lg shadow-xl p-4 flex flex-col gap-3 w-[680px] max-w-[95vw]">
            <div>
              <p class="text-sm font-medium text-text-primary">Discard all changes?</p>
              <p class="text-xs text-text-secondary mt-0.5">
                This will restore your files to the last commit. This cannot be undone.
              </p>
            </div>
            <Show
              when={!diffLoading()}
              fallback={
                <div class="h-[320px] rounded border border-border bg-bg-primary flex items-center justify-center text-text-tertiary text-xs">
                  Loading diff…
                </div>
              }
            >
              <DiffViewer content={diffContent()} />
            </Show>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetDialog(false)}
                class="h-7 px-3 rounded text-xs font-medium bg-bg-tertiary hover:bg-border text-text-primary border border-border transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                class="h-7 px-3 rounded text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors cursor-pointer"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
}
