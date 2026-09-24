import { createEffect, onCleanup, onMount } from "solid-js";
import { notifyGitRefresh } from "../lib/gitRefreshBus";
import { mountWorkflow } from "../workflow/mount";

interface WorkflowViewProps {
  /** When false, the canvas is hidden with the rest of the tab. */
  isActive?: boolean;
}

export function WorkflowView(props: WorkflowViewProps) {
  let host: HTMLDivElement | undefined;
  const listeners = new Set<(active: boolean) => void>();

  createEffect(() => {
    const active = props.isActive !== false;
    for (const listener of listeners) listener(active);
  });

  onMount(() => {
    if (!host) return;
    const unmount = mountWorkflow(host, {
      getActive: () => props.isActive !== false,
      subscribeActive: (listener) => {
        listeners.add(listener);
        listener(props.isActive !== false);
        return () => listeners.delete(listener);
      },
      onSaved: () => notifyGitRefresh(),
    });
    onCleanup(unmount);
  });

  return <div ref={host} class="workflow-editor flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden" />;
}
