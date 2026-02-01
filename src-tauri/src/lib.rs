use std::sync::Arc;

use anyhow::Result;

pub mod auth;
pub mod config;
pub mod secrets;
pub mod setup;
pub mod workflow;

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
        .invoke_handler(tauri::generate_handler![
            greet,
            setup::get_setup_status,
            setup::save_twitch_credentials,
            setup::test_twitch_credentials,
            secrets::commands::list_secrets,
            secrets::commands::get_secret,
            secrets::commands::set_secret,
            secrets::commands::delete_secret,
            workflow::commands::save_workflow,
            workflow::commands::load_workflow,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
