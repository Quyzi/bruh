# Bruh

> **Important:** This project is not production ready. Expect bugs, incomplete features, and breaking changes.

![Bruh Screenshot](/public/screenshot.png)

## Features

- **Visual Workflow Editor**: Drag‑and‑drop node‑based workflow creation using litegraph.js.
- **Twitch EventSub Integration**: Connect to Twitch via EventSub WebSocket for real‑time chat, channel points, subs, raids, and more (30+ event types).
- **Rhai Scripting**: Write powerful automation scripts in Rhai (a Rust‑embedded language) with full access to workflow data.
- **Encrypted Secrets Store**: Securely store API keys, tokens, and other sensitive values using RSA+AES encryption.
- **Embedded DuckDB**: Persistent workflow data and ad‑hoc SQL querying via a bundled SQLite‑compatible database.
- **Timer & Interval Nodes**: Schedule periodic actions.
- **Overlay System**: Create custom Twitch overlays that can be controlled via workflows and jinja templates.
- **AI Agents**: Experimental integration with LLM‑powered agents for dynamic responses.
- **Cross‑Platform**: Builds for Windows, macOS, and Linux.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Desktop Framework** | [Tauri](https://tauri.app) (Rust backend + web frontend) |
| **Frontend** | [SolidJS](https://www.solidjs.com/) + [TypeScript](https://www.typescriptlang.org/) |
|  | [Vite](https://vitejs.dev/) (dev server & hot reload) |
|  | [litegraph.js](https://github.com/jesusguzman/litegraph.js) (visual node‑graph editor) |
|  | [Monaco Editor](https://microsoft.github.io/monaco-editor/) (Rhai & SQL editing) |
|  | [Tailwind CSS](https://tailwindcss.com/) (styling) |
| **Backend (Rust)** | [Tokio](https://tokio.rs/) (async runtime) |
|  | [Rustls](https://docs.rs/rustls) + `aws_lc_rs` (TLS) |
|  | [DuckDB](https://duckdb.org/) (embedded SQL) via `async-duckdb` |
|  | [Rhai](https://rhaiscript.com/) (scripting) |
|  | [securestore-rs](https://github.com/Quyzi/securestore-rs) (encrypted secret store) |
|  | [twitch_api](https://crates.io/crates/twitch_api) (Twitch API client) |
|  | [gitoxide](https://crates.io/crates/gitoxide) (revision control of user data) |
| **Data Storage** | `~/.bruh/` directory (JSON config files) |
|  | DuckDB (persistent workflow data) |
|  | Encrypted secrets via securestore-rs |

## Prerequisites

- **Node.js** (≥18 recommended)
- **Rust** (stable toolchain) with the following targets:
  - `cargo install tauri-cli --version ^2`
  - System dependencies for Tauri (see [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites))
- **Git** (to clone the repository)

## Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/quyzi/bruh.git
   cd bruh
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Start the development environment**
   ```bash
   # Full dev environment (Tauri + Vite hot reload)
   npm run tauri:dev
   ```
   *Alternatively, for frontend‑only iteration:*
   ```bash
   npm run dev   # Vite dev server on http://localhost:1420
   ```

   > **Note**: On some Linux systems you may need to set environment variables:
   > ```bash
   > CXX=clang++ CC=clang WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri:dev
   > ```

4. **Setup Twitch OAuth**
   - Go to the **Setup** tab.
   - Enter your Twitch Application Client ID and Secret (create one at [Twitch Developer Console](https://dev.twitch.tv/console)).
   - Follow the OAuth flow to authorize the app and select required scopes (e.g., `chat:read`, `chat:edit`, `channel:bot`).

5. **Add Channels**
   - Navigate to the **Channels** tab.
   - Add the Twitch channel login names you want the bot to join.

6. **Create a Workflow**
   - Open the **Workflow** tab.
   - Right‑click on the canvas → **Add Node** → choose an event source (e.g., *Twitch → Chat Message*).
   - Connect it to an action node (e.g., *Twitch → Send Chat* or *Script → Rhai Script*).
   - Save the workflow using the toolbar button.

7. **Start the Runtime**
   - Click the **Start** button in the top toolbar.
   - The bot will connect to Twitch and execute your workflows.

## Building for Production

```bash
# Production build (full Tauri app)
npm run tauri:build
```

The resulting binaries/AppImage will be located in `src-tauri/target/release/bundle/`.

### Custom Linux Build (AppImage)

```bash
./build.sh
```

This script handles AppImage permissions and outputs a distributable AppImage.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CXX=clang++ CC=clang` | Required for Rust compilation on some Linux setups. |
| `WEBKIT_DISABLE_DMABUF_RENDERER=1` | Needed for WebKit on some Linux systems. |
| `APPIMAGE_EXTRACT_AND_RUN=1` | Fixes AppImage execution on Linux. |

These are automatically set by the provided npm scripts.

## Project Structure

```
bruh/
├─ src/                 # Frontend (SolidJS + TypeScript)
│   ├─ components/      # UI components (TabBar, Layout, etc.)
│   ├─ lib/             # SolidJS stores (auth, metrics, etc.)
│   ├─ nodes/           # Workflow node definitions (frontend)
│   ├─ views/           # Tab views (Dashboard, Channels, etc.)
│   └─ ...              
├─ src-tauri/           # Backend (Rust + Tauri)
│   ├─ src/             # Rust source code
│   │   ├─ runtime/     # Core execution (pipeline, executor, nodes)
│   │   ├─ auth.rs      # Twitch OAuth flow
│   │   ├─ database.rs  # DuckDB integration
│   │   ├─ secrets/     # Encrypted secret store
│   │   ├─ scripts/     # Rhai script management
│   │   └─ ...          
│   ├─ Cargo.toml       # Rust dependencies
│   └─ ...              
├─ public/              # Static assets
├─ index.html           # Entry HTML
├─ package.json         # Frontend dependencies & scripts
├─ tsconfig.json        # TypeScript configuration
├─ vite.config.ts       # Vite configuration
└─ build.sh             # Custom Linux build script
```

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
