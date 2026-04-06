import { createSignal, onMount } from "solid-js";

export function OverlayWindowView() {
  const [content, setContent] = createSignal<string>("");

  onMount(() => {
    // Transparent full-screen overlay — content will be driven by Tauri events
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
  });

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "transparent",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div innerHTML={content()} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
