# Bruh
Bruh is a powerful twitch chatbot written in rust powered by [tauri](https://v2.tauri.app/). The frontend is written in HTML + Typescript using solid.js.

# Building
- **Linux (deb, rpm, AppImage):** Use `npm run tauri:build` so the AppImage step gets `ARCH=x86_64` and `APPIMAGE_EXTRACT_AND_RUN=1`. That avoids "failed to run linuxdeploy" when FUSE isn’t available or architecture is ambiguous. Plain `npm run tauri build` may still fail at the AppImage step on some systems.
- **Other:** `npm run tauri build` as usual. 

# Project Layout
- `./src` :: Typescript + solid.js user interface
- `./src-tauri` :: Rust backend

# Features
+ Custom actions on eventsub events
+ Chat message parsing and extraction
+ Scripted actions using rhai language
+ Encrypted secrets storage
+ Sqlite database support
+ Twitch authentication using [authorization code grant flow](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#authorization-code-grant-flow)
+ User specified client_id and client_secret for authentication
+ Multiple twitch channels

# User Interface
The Bruh UI is a simple web service running on https://localhost:42069
1. Initial Setup for global configuration
    - Config generation
    - Secrets setup
    - Twitch authentication
2. Workflow editor powered by [litegraph](https://github.com/jagenjo/litegraph.js)
3. Secrets editor
4. Database query UI (duckdb web ui)

## Litegraph Custom Nodes
- A custom node for each [twitch eventsub event](https://dev.twitch.tv/docs/eventsub/eventsub-reference/#events)
- Store Secret
- Retrieve Secret
- Database query
- Run rhai script
- Send chat message

# Rust Crates Used
- `rhai` :: User action scripting language
- `async_duckdb` :: Sqlite 
- `twitch_api` :: Twitch authentication and eventsub handling
- `securestore` :: Secrets storage

# Javascript libraries used
- `litegraph` :: Workflow editor
- `solidjs` :: TS/JS library
- `monaco-editor` :: Code editor 
- `tailwindcss` :: CSS Framework
