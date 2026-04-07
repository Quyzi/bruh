import { onMount, onCleanup } from "solid-js";
import { listenOverlayDisplay, readOverlayTemplate, type OverlayEventPayload } from "../lib/tauri";

const GAP_MS = 300; // brief clear between queued items

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] ?? "");
}

export function OverlayWindowView() {
  let iframeRef: HTMLIFrameElement | undefined;
  let activeTimer: ReturnType<typeof setTimeout> | null = null;
  const queue: OverlayEventPayload[] = [];
  let processing = false;
  let mounted = true;

  const processNext = async () => {
    if (!mounted || queue.length === 0) {
      processing = false;
      return;
    }

    processing = true;
    const payload = queue.shift()!;

    try {
      const template = await readOverlayTemplate(payload.template_name);
      const rendered = renderTemplate(template, {
        message: payload.message,
        duration_ms: String(payload.duration_ms),
        template_name: payload.template_name,
      });

      if (iframeRef) iframeRef.srcdoc = rendered;

      await new Promise<void>((resolve) => {
        activeTimer = setTimeout(resolve, payload.duration_ms);
      });
    } catch (e) {
      console.error("Overlay render failed:", e);
    }

    if (iframeRef) iframeRef.srcdoc = "";

    // Brief gap between items so the clear is visible before the next loads
    await new Promise<void>((resolve) => {
      activeTimer = setTimeout(resolve, GAP_MS);
    });

    processNext();
  };

  const enqueue = (payload: OverlayEventPayload) => {
    queue.push(payload);
    if (!processing) processNext();
  };

  onMount(() => {
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";

    const unlisten = listenOverlayDisplay(enqueue);
    onCleanup(async () => {
      mounted = false;
      if (activeTimer) clearTimeout(activeTimer);
      queue.length = 0;
      (await unlisten)();
    });
  });

  return (
    <iframe
      ref={iframeRef}
      srcdoc=""
      style={{
        position: "fixed",
        inset: "0",
        width: "100vw",
        height: "100vh",
        border: "none",
        background: "transparent",
        "pointer-events": "none",
      }}
      title="Overlay"
    />
  );
}
