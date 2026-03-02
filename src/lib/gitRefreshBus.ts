import { createSignal } from "solid-js";

// Incrementing this signal causes GitControls to immediately re-check dirty status.
// Call notifyGitRefresh() after any write that modifies tracked files.
const [tick, setTick] = createSignal(0);
export const gitRefreshSignal = tick;
export function notifyGitRefresh(): void {
  setTick((n) => n + 1);
}
