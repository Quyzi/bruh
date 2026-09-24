import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "fs";
import { resolve } from "path";

const pkg = JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf-8")) as { version: string };

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// Observed build id: `/home/.../src/workflow/ui/FlowNode.tsx` (absolute, no query).
// Left unanchored so a `?query` suffix still matches.
const workflowUiTsx = /workflow\/ui\/.*\.tsx/;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    // React island for the workflow canvas. Solid owns every other .tsx file.
    // Production builds drop plugin-react's Babel transform and compile JSX with
    // esbuild. Without an explicit import source, esbuild keeps tsconfig's
    // `solid-js` jsxImportSource (`solid-js/jsx-runtime` → solid.js, which has no `jsxs`).
    react({ include: workflowUiTsx, jsxImportSource: "react" }),
    solid({ exclude: workflowUiTsx }),
    tailwindcss(),
  ],

  define: {
    __BRUH_VERSION__: JSON.stringify(pkg.version),
  },

  optimizeDeps: {
    exclude: ["monaco-editor"],
  },

  // Suppress chunk size warning - not relevant for Tauri desktop apps (single bundle, no CDN)
  build: {
    chunkSizeWarningLimit: 6000,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
