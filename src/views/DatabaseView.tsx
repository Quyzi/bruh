import { openUrl } from "@tauri-apps/plugin-opener";

export function DatabaseView() {
  const handleOpen = async () => {
    await openUrl("http://localhost:4213");
  };

  return (
    <div class="flex flex-col items-center justify-center h-full text-text-secondary gap-6">
      <div class="text-center space-y-2">
        <h2 class="text-text-primary font-medium text-2xl">DuckDB Web UI</h2>
        <p>Query and explore your database using DuckDB's built-in interface</p>
      </div>

      <button
        onClick={handleOpen}
        class="bg-accent hover:bg-accent-hover text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center gap-3"
      >
        <svg
          class="w-5 h-5"
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
  );
}
