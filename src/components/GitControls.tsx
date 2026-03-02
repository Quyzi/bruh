import {
  createSignal,
  createEffect,
  on,
  onMount,
  onCleanup,
  Show,
  For,
} from "solid-js";
import { listen } from "@tauri-apps/api/event";
import {
  gitGetStatus,
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

export function GitControls() {
  const [status, setStatus] = createSignal<GitStatusResult | null>(null);
  // The hash of the commit whose content is currently on disk.
  // Starts as HEAD; changes when the user selects an old revision.
  const [activeHash, setActiveHash] = createSignal<string | null>(null);
  const [showDropdown, setShowDropdown] = createSignal(false);
  const [showCommitDialog, setShowCommitDialog] = createSignal(false);
  const [commitMessage, setCommitMessage] = createSignal("");
  const [loading, setLoading] = createSignal(false);

  const dirty = () => status()?.dirty ?? false;
  const commits = () => status()?.commits ?? [];
  const headCommit = () => commits().find((c) => c.isHead) ?? null;

  const refresh = async () => {
    try {
      const s = await gitGetStatus();
      setStatus(s);
      // Initialise activeHash once we have commits; on subsequent refreshes
      // don't overwrite an intentional checkout selection.
      if (activeHash() === null) {
        const head = s.commits.find((c) => c.isHead);
        if (head) setActiveHash(head.hash);
      }
    } catch {
      // Silently ignore — git may not be available yet
    }
  };

  // React immediately when any view notifies that tracked files changed
  createEffect(on(gitRefreshSignal, () => refresh(), { defer: true }));

  onMount(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);

    const unlistenPromise = listen("bruh://data-restored", () => {
      refresh();
    });

    onCleanup(() => {
      clearInterval(interval);
      unlistenPromise.then((u) => u());
    });
  });

  // Close dropdown when clicking outside
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

  const handleReset = async () => {
    if (!dirty() || loading()) return;
    setLoading(true);
    try {
      await gitReset();
      await refresh();
      // Files are now at HEAD
      const head = status()?.commits.find((c) => c.isHead);
      if (head) setActiveHash(head.hash);
    } finally {
      setLoading(false);
    }
  };

  const openCommitDialog = () => {
    setCommitMessage(defaultCommitMessage());
    setShowCommitDialog(true);
  };

  const handleCommit = async () => {
    if (loading()) return;
    const msg = commitMessage().trim() || defaultCommitMessage();
    setLoading(true);
    setShowCommitDialog(false);
    try {
      await gitCommit(msg);
      await refresh();
      // The new HEAD is now the active revision
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
      // Mark this revision as the one currently on disk
      setActiveHash(commit.hash);
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div class="flex items-center gap-1" data-git-dropdown>
        {/* Revision dropdown trigger — shows the active (on-disk) revision */}
        <div class="relative">
          <button
            type="button"
            onClick={() => setShowDropdown((v) => !v)}
            disabled={loading()}
            class="h-6 px-2 rounded text-xs font-mono font-medium bg-bg-tertiary hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed border border-border transition-colors cursor-pointer flex items-center gap-1"
            classList={{
              // Amber when the active revision differs from HEAD (viewing old state)
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
                    // Active-but-not-HEAD means the user has checked out an older revision
                    const isActiveOnly = () => isActive() && !isHead;
                    return (
                      <button
                        type="button"
                        onClick={() => handleCheckout(commit)}
                        disabled={isActive() || loading()}
                        class="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-bg-tertiary disabled:cursor-default transition-colors"
                        classList={{
                          "bg-bg-tertiary": isHead || isActive(),
                        }}
                      >
                        {/* Indicator dot */}
                        <span class="mt-1 w-1.5 h-1.5 rounded-full shrink-0 flex-none"
                          classList={{
                            "bg-accent": isHead && !isActiveOnly(),
                            "bg-amber-400": isActiveOnly(),
                            "bg-transparent": !isHead && !isActive(),
                          }}
                        />
                        <span class="flex flex-col min-w-0">
                          {/* Hash + badges */}
                          <span class="font-mono text-xs flex items-center gap-1.5">
                            <span classList={{
                              "text-accent font-semibold": isHead,
                              "text-amber-400 font-semibold": isActiveOnly(),
                              "text-text-secondary": !isHead && !isActiveOnly(),
                            }}>
                              {commit.hash}
                            </span>
                            <Show when={isHead}>
                              <span class="text-accent opacity-70 text-[10px]">HEAD</span>
                            </Show>
                            <Show when={isActiveOnly()}>
                              <span class="text-amber-400 opacity-80 text-[10px]">active</span>
                            </Show>
                          </span>
                          <span class="text-xs text-text-primary truncate">
                            {commit.message}
                          </span>
                          <span class="text-xs text-text-secondary">
                            {formatTimestamp(commit.timestamp)}
                          </span>
                        </span>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>
        </div>

        {/* Reset button — red when active */}
        <button
          type="button"
          disabled={!dirty() || loading()}
          onClick={handleReset}
          class="h-6 px-2 rounded text-xs font-medium transition-colors cursor-pointer border"
          classList={{
            "bg-red-600 hover:bg-red-700 text-white border-red-700":
              dirty() && !loading(),
            "bg-bg-tertiary text-text-secondary border-border opacity-50 cursor-not-allowed":
              !dirty() || loading(),
          }}
          title="Discard uncommitted changes"
        >
          Reset
        </button>

        {/* Commit button — green when active */}
        <button
          type="button"
          disabled={!dirty() || loading()}
          onClick={openCommitDialog}
          class="h-6 px-2 rounded text-xs font-medium transition-colors cursor-pointer border"
          classList={{
            "bg-success hover:bg-success/80 text-white border-success/80":
              dirty() && !loading(),
            "bg-bg-tertiary text-text-secondary border-border opacity-50 cursor-not-allowed":
              !dirty() || loading(),
          }}
          title="Commit current changes"
        >
          Commit
        </button>
      </div>

      {/* Commit message dialog */}
      <Show when={showCommitDialog()}>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowCommitDialog(false);
          }}
        >
          <div class="bg-bg-secondary border border-border rounded-lg shadow-xl p-4 w-80 flex flex-col gap-3">
            <p class="text-sm font-medium text-text-primary">Commit message</p>
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
    </>
  );
}
