import { createSignal, onMount } from "solid-js";
import {
  getExecutorState,
  executorStart,
  executorStop,
  type ExecutorState,
} from "../lib/tauri";

export function DashboardView() {
  const [status, setStatus] = createSignal<ExecutorState | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const refreshStatus = async () => {
    setError(null);
    try {
      const state = await getExecutorState();
      setStatus(state);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to get executor status");
      setStatus(null);
    }
  };

  onMount(() => {
    refreshStatus();
  });

  const handleStart = async () => {
    setError(null);
    setLoading(true);
    try {
      await executorStart();
      await refreshStatus();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to start executor");
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setError(null);
    setLoading(true);
    try {
      await executorStop();
      await refreshStatus();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to stop executor");
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setError(null);
    setLoading(true);
    try {
      await executorStop();
      await executorStart();
      await refreshStatus();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message ?? "Failed to restart executor");
    } finally {
      setLoading(false);
    }
  };

  const currentStatus = () => status();
  const isRunning = () => currentStatus() === "running";
  const isStopped = () => currentStatus() === "stopped";

  return (
    <div class="flex flex-col gap-6 p-6 max-w-2xl">

      <div class="bg-bg-secondary rounded-lg p-6 space-y-4">
        <h3 class="text-text-primary font-medium">Executor</h3>
        <p class="text-text-secondary text-sm">
          The executor runs your workflow: it listens for Twitch EventSub events
          and runs connected scripts and actions. Start it when you want events
          to trigger your workflow.
        </p>

        <div class="flex flex-wrap items-center gap-3">
          <span
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-medium"
            classList={{
              "bg-success/15 text-success": isRunning(),
              "bg-bg-tertiary text-text-secondary": isStopped(),
              "bg-bg-tertiary text-text-secondary": currentStatus() === null,
            }}
          >
            <span
              class="w-2 h-2 rounded-full shrink-0"
              classList={{
                "bg-success": isRunning(),
                "bg-text-secondary": !isRunning(),
              }}
            />
            {currentStatus() === null
              ? "…"
              : currentStatus() === "running"
                ? "Running"
                : "Stopped"}
          </span>
          <div class="flex gap-2">
            <button
              type="button"
              disabled={loading() || isRunning()}
              onClick={handleStart}
              class="bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors cursor-pointer"
            >
              Start
            </button>
            <button
              type="button"
              disabled={loading() || isStopped()}
              onClick={handleStop}
              class="bg-bg-tertiary hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed text-text-primary font-medium py-2 px-4 rounded border border-border transition-colors cursor-pointer"
            >
              Stop
            </button>
            <button
              type="button"
              disabled={loading() || isStopped()}
              onClick={handleRestart}
              class="bg-bg-tertiary hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed text-text-primary font-medium py-2 px-4 rounded border border-border transition-colors cursor-pointer"
            >
              Restart
            </button>
          </div>
        </div>

        {error() && (
          <div class="bg-error/10 border border-error/30 rounded p-3 text-error text-sm">
            {error()}
          </div>
        )}
      </div>
    </div>
  );
}
