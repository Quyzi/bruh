use std::sync::Arc;

use anyhow::Result;
use tokio::sync::RwLock;
use tracing_subscriber::{
    filter::LevelFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt, Registry,
};

pub mod auth;
pub mod config;
mod log_layer;
pub mod scripts;
pub mod secrets;
pub mod setup;
pub mod workflow;
pub mod executor;

pub use auth::{create_twitch_auth, AuthError, ReqwestTwitchAuth, SharedTwitchAuth, TwitchAuth};
pub use config::{expand_tilde, Config, ConfigError};
pub use secrets::{SecureStoreConfig, SecureStoreProvider};

use log_layer::WebviewLogLayer;

pub type Database = Arc<async_duckdb::Client>;
pub type Secrets = Arc<SecureStoreProvider>;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

pub fn run(config: Config, secrets: Secrets, db: Database) -> Result<()> {
    let workflow_path = expand_tilde(&config.workflow);
    let initial_workflow = workflow::commands::load_workflow_from_path(&workflow_path)
        .ok()
        .flatten()
        .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()));
    let executor = executor::Executor::new(config.clone(), secrets.clone(), initial_workflow);
    let executor_state: Arc<RwLock<executor::Executor>> = Arc::new(RwLock::new(executor));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            // Set up tracing with both terminal output and webview forwarding
            Registry::default()
                .with(fmt::layer())
                .with(WebviewLogLayer::new(app.handle().clone()))
                .with(LevelFilter::DEBUG)
                .init();

            tracing::info!("🦀 Starting Bruh!");
            Ok(())
        })
        .manage(config)
        .manage(secrets)
        .manage(db)
        .manage(executor_state)
        .invoke_handler(tauri::generate_handler![
            greet,
            setup::get_setup_status,
            setup::save_twitch_credentials,
            setup::test_twitch_credentials,
            setup::get_twitch_auth_url,
            setup::exchange_twitch_code,
            setup::validate_twitch_token,
            setup::logout_twitch,
            setup::save_twitch_scopes,
            setup::get_twitch_scopes,
            secrets::commands::list_secrets,
            secrets::commands::get_secret,
            secrets::commands::set_secret,
            secrets::commands::delete_secret,
            workflow::commands::save_workflow,
            workflow::commands::load_workflow,
            scripts::commands::list_scripts,
            scripts::commands::read_script,
            scripts::commands::write_script,
            scripts::commands::delete_script,
            scripts::commands::rename_script,
            scripts::commands::execute_script,
            scripts::commands::test_script,
            executor::executor_start,
            executor::executor_stop,
            executor::get_executor_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
