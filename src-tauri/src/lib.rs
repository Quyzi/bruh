use std::sync::Arc;

use anyhow::Result;

pub mod auth;
pub mod config;
pub mod secrets;

pub use auth::{create_twitch_auth, AuthError, ReqwestTwitchAuth, SharedTwitchAuth, TwitchAuth};
pub use config::{Config, ConfigError};
pub use secrets::{SecureStoreConfig, SecureStoreProvider};

pub type Database = Arc<async_duckdb::Client>;
pub type Secrets = Arc<SecureStoreProvider>;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

pub fn run(config: Config, secrets: Secrets, db: Database) -> Result<()> {
    tracing::info!("🦀 Starting Clawdia!");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(config)
        .manage(secrets)
        .manage(db)
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
