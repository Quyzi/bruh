# Bruh

A desktop Twitch automation app built with [Tauri](https://tauri.app). It gives you a visual node-graph workflow editor (similar to Node-RED) where you wire together Twitch events, scripts, AI calls, database queries, and chat actions without writing application code.

Runs locally on your machine. No cloud service, no subscription.

## What it actually does

You build workflows by connecting nodes on a canvas. A workflow starts with a trigger node (a Twitch event, a chat message, or a timer), passes data through processing nodes, and ends with action nodes (like sending a chat message). When you hit Start, the runtime opens a Twitch EventSub WebSocket connection and begins executing your workflow whenever triggers fire.

### Trigger nodes

**Twitch EventSub** -- subscribes to one of 30+ Twitch event types:

- Channel: follow, subscribe, subscription gift, subscription end, subscription message, bits (cheer), ad break, poll, prediction, hype train, goals, charity campaigns, channel points (custom rewards, automatic rewards, redemptions), stream online/offline
- Chat: chat message, chat notification, chat clear, chat settings update
- Moderation: moderator actions (ban/unban/timeout), suspicious user detection, warnings, unban requests, shout-outs (create/receive), automod (message hold/update, settings/terms update)
- User: user authorization, user whisper messages
- Subscriptions and VIP: subscription status changes, VIP status changes
- Extensions and drops: extension events, Twitch Drops entitlements
- Guest Star and Shared Chat: guest star session management, shared chat sessions

**Chat message prefix** -- monitors all chat messages in configured channels and extracts sender, message text, and metadata.

**Timer** -- fires on a configurable interval (e.g., every 5 seconds, every hour).

### Processing nodes

**Rhai script** -- runs an embedded [Rhai](https://rhai.rs) 1.24 script. Up to 5 named inputs. Scripts live in `~/.bruh/scripts/` and can be edited and tested in the Scripts tab with custom JSON input.

**AI prompt** -- calls an LLM with a templated prompt. Supports 12 providers via `rig-core`:
- Hosted: OpenAI, Anthropic, Groq, Mistral, Cohere, Gemini, DeepSeek, OpenRouter, Perplexity, Together, xAI
- Local: Ollama, LlamaFile

Up to 5 text inputs for prompt templating (substitute with `?1`-`?5`). Returns the model's response as a string. API keys are stored in the encrypted secrets store.

**Database query** -- runs a DuckDB SQL query. Up to 5 input parameters (`?1`-`?5` placeholders). Returns result sets as JSON (for SELECT) or row count (for DML).

**Get secret / Set secret / List secrets / Delete secret** -- reads and writes encrypted secrets by name.

### Action nodes

**Send chat message** -- sends a message to a specific channel. Automatically splits messages longer than 500 characters at word boundaries to respect Twitch's limit.

**Broadcast chat** -- sends the same message to all configured channels.

### Data flow

Nodes are executed in topological order. Data passes between nodes through numbered output and input slots. Each workflow run is stateless by default -- if you need persistence across runs, use the Database node to read and write DuckDB.

## Tabs

**Dashboard** -- live metrics per node (execution count, error count, latency) displayed as Chart.js time-series graphs. Also shows a real-time chat feed from all monitored channels. Filterable by node ID, node type, group name, or channel.

**Channels** -- add or remove Twitch channels to monitor. Validates the channel exists via the Twitch API and shows which OAuth scopes are required for each channel (moderator scopes differ from owner scopes).

**Workflow** -- the LiteGraph canvas. Add nodes from a categorized menu, wire them together, and save. Changes are auto-committed to a local git repo in `~/.bruh/`.

**Scripts** -- create, edit, delete, and test Rhai scripts. Monaco Editor with Rhai syntax support. Each script can be tested with custom JSON input before wiring into a workflow.

**AI Agents** -- configure AI agent profiles (provider, model, max tokens). API keys are stored in the secrets store, not in the agent config file.

**Secrets** -- manage encrypted key-value secrets. All values are encrypted at rest with RSA+AES via `securestore-rs`. The secrets key file is never tracked in git.

**Database** -- edit and run startup SQL that runs when the runtime starts. Also links to an HTTP UI on port 4213 for interactive DuckDB querying.

**Setup** -- Twitch OAuth login (opens system browser), token validation, logout, and scope selection. Also has shortcuts for chat moderation commands (delete message, timeout user, ban user).

**Help** -- built-in documentation.

## Data storage

Everything lives in `~/.bruh/`:

| Path | Contents |
|------|----------|
| `workflow.json` | LiteGraph workflow serialization |
| `scripts/*.rhai` | Rhai script files |
| `secrets.key` | RSA private key (never tracked in git) |
| `bruh.duckdb` | DuckDB database file |
| `ai_agents.json` | AI agent configurations (no API keys) |
| `channels.json` | List of configured Twitch channels |
| `.git/` | Auto-initialized git repo for workflow/script history |

A `.gitignore` is created automatically to exclude `secrets.key` and database files.

## Authentication

Twitch OAuth 2.0 flow. The app opens your system browser to complete the OAuth handshake. You copy the callback URL back into the app. (There is no local HTTP redirect server -- you paste the URL manually.)

Tokens are refreshed automatically every 5 minutes (or at 75% of the token lifespan, whichever comes first).

You select which Twitch OAuth scopes to request. Some EventSub subscriptions require scopes that are only available if the authenticated user is the channel owner or a moderator.

## Git integration

The `~/.bruh/` directory is a git repository. Workflow and script changes are automatically committed. You can:

- View commit history and dirty state
- Commit changes with a message
- Reset to a working state
- Check out a specific revision

This gives you an audit trail and a basic undo history outside the app.

## Metrics

Prometheus-compatible metrics are exported. The dashboard reads these on a configurable scrape interval and displays time-series graphs per node. Tracked per node: execution count, error count, and latency. Auth failures and token refresh failures are also tracked.

## Building and running

```bash
# Full dev environment (Tauri + Vite hot reload)
npm run tauri:dev

# Frontend only (Vite on port 1420)
npm run dev

# Production build
npm run tauri:build

# Linux build with AppImage permission handling
./build.sh
```

Some Linux systems need environment variables:

```bash
# Rust compilation with clang
CXX=clang++ CC=clang npm run tauri:dev

# WebKit on some Linux systems
WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri:dev

# AppImage execution
APPIMAGE_EXTRACT_AND_RUN=1 npm run tauri:build
```

There is no test runner. Rust compilation errors serve as the primary validation layer. Individual Rhai scripts can be tested in the Scripts tab.

## Tech stack

**Frontend:** SolidJS, TypeScript (strict mode), LiteGraph.js, Monaco Editor, Chart.js, Tailwind CSS, Tauri API bridge

**Backend:** Rust, Tauri, Tokio (async runtime), `twitch_api` (0.7.2), `tokio-tungstenite` (EventSub WebSocket), `async-duckdb` (bundled DuckDB), `securestore-rs` (RSA+AES encryption), `rustls` with `aws_lc_rs` (no OpenSSL), `rig-core` (multi-provider LLM), `rhai` (1.24), `gix` (gitoxide), `metrics` + `metrics-exporter-prometheus`, `tracing`

## Honest limitations

- **One workflow at a time.** There is no concept of multiple active workflows. One `workflow.json`, one runtime.
- **5 input slots per node.** All nodes are limited to inputs 1 through 5.
- **No custom node definitions.** All node types are hardcoded. You cannot define new node types without modifying the source code and recompiling.
- **Manual OAuth callback.** You paste the callback URL from the browser manually. This is cumbersome.
- **No workflow import/export.** Workflows are local JSON files. There is no standardized export format or sharing mechanism.
- **Single DuckDB connection.** Queries execute sequentially. There is no connection pooling.
- **Desktop only.** All execution, the metrics dashboard, and the DuckDB HTTP UI are local to the running desktop app.
- **No unit tests.** The project has no test suite beyond the Rust compiler.

## License

See [LICENSE](LICENSE).
