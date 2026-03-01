# bruh

A cross-platform Twitch chatbot and automation desktop app with a visual workflow builder. Wire together Twitch events, scripts, database queries, and chat actions using a node-graph editor — no code required.

## Features

- **Visual workflow editor** — drag-and-drop node graph (powered by litegraph.js)
- **Twitch integration** — EventSub for 30+ event types, OAuth authentication, chat send/receive
- **Scripting** — embedded [Rhai](https://rhai.rs) for custom logic nodes
- **SQL database** — built-in DuckDB with a browser UI on port 4213
- **Secret management** — encrypted storage for API keys and tokens
- **Prometheus metrics** — built-in observability endpoint
- **Cross-platform** — macOS, Linux, Windows

## Development

```bash
npm run tauri:dev    # Start dev environment (hot reload)
npm run tauri:build  # Production build
./build.sh           # Linux AppImage build
```

Requires Node.js, Rust, and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform.

On Linux, the dev command sets `CXX=clang++ CC=clang` and `WEBKIT_DISABLE_DMABUF_RENDERER=1` automatically via the npm script.

## Node Types

| Node | Description |
|------|-------------|
| Event Source | Subscribe to Twitch EventSub events |
| Broadcast Chat | Monitor all chat messages |
| Send Chat | Send a chat message |
| Rhai Script | Run custom logic |
| Get Secret | Retrieve an encrypted secret |
| Database Query | Run a SQL query against DuckDB |
| Timer | Fire on a configurable interval |

## Stack

- **Frontend:** SolidJS, TypeScript, Tailwind CSS, Vite, litegraph.js, Monaco Editor
- **Backend:** Rust, Tauri 2, Tokio, Rhai, DuckDB, Rustls
