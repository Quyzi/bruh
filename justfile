# Bruh — Tauri + SolidJS task runner. Run `just` to list recipes.

default:
    @just --list

# --- Run ---------------------------------------------------------------

# Run the full app (Tauri + Vite) in dev mode
dev:
    npm run tauri:dev

alias run := dev

# Frontend only (Vite dev server on port 1420)
frontend:
    npm run dev

# Preview a production frontend build (run `just frontend-build` first)
preview:
    npm run serve

# --- Build -------------------------------------------------------------

# Production build (AppImage + deb). Handles noexec /tmp and linuxdeploy cache perms.
build:
    ./build.sh

# Raw Tauri release build without the build.sh environment fixes
tauri-build:
    npm run tauri:build

# Frontend-only production bundle (dist/)
frontend-build:
    npm run build

# --- Test & check ------------------------------------------------------

# Rust unit tests
test:
    cargo test --manifest-path src-tauri/Cargo.toml

# Type-check everything: Rust + both TypeScript projects
check:
    cargo check --manifest-path src-tauri/Cargo.toml
    npx tsc --noEmit -p tsconfig.json
    npx tsc --noEmit -p tsconfig.workflow.json

# Validate the litegraph workflow docs bundle
check-graph:
    npm run check:graph

# --- Housekeeping ------------------------------------------------------

install:
    npm ci

clean:
    cargo clean --manifest-path src-tauri/Cargo.toml
    rm -rf dist
