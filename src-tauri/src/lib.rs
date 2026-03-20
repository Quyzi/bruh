use std::sync::Arc;

use anyhow::Result;
use metrics_exporter_prometheus::PrometheusHandle;
use tauri::State;
use tokio::sync::RwLock;
use tracing_subscriber::{
    filter::LevelFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt, Registry,
};

pub mod ai_agents;
pub mod auth;
pub mod channels;
pub mod chat_commands;
pub mod config;
pub mod database;
pub mod git;
pub mod log_layer;
pub mod metrics;
pub mod runtime;
pub mod scripts;
pub mod secrets;
pub mod setup;

pub use auth::{create_twitch_auth, AuthError, ReqwestTwitchAuth, SharedTwitchAuth, TwitchAuth};
pub use config::{expand_tilde, Config, ConfigError};
pub use secrets::{SecureStoreConfig, SecureStoreProvider};

use log_layer::WebviewLogLayer;

use crate::setup::CommandError;

pub type Database = Arc<async_duckdb::Client>;
pub type Secrets = Arc<SecureStoreProvider>;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

pub fn run(
    config: Config,
    secrets: Secrets,
    db: Database,
    metrics: PrometheusHandle,
) -> Result<()> {
    let workflow_path = expand_tilde(&config.workflow);
    let initial_workflow = runtime::load_workflow_from_path(&workflow_path)
        .ok()
        .flatten()
        .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()));
    let runtime_instance = runtime::Runtime::new(
        config.clone(),
        secrets.clone(),
        initial_workflow,
        Some(db.clone()),
    );
    let runtime_state: Arc<RwLock<runtime::Runtime>> = Arc::new(RwLock::new(runtime_instance));

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
        .manage(metrics)
        .manage(runtime_state)
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
            setup::get_required_channel_scopes,
            setup::validate_channel,
            channels::load_channels,
            channels::save_channels,
            secrets::commands::list_secrets,
            secrets::commands::get_secret,
            secrets::commands::set_secret,
            secrets::commands::delete_secret,
            runtime::commands::save_workflow,
            runtime::commands::load_workflow,
            scripts::commands::list_scripts,
            scripts::commands::read_script,
            scripts::commands::write_script,
            scripts::commands::delete_script,
            scripts::commands::rename_script,
            scripts::commands::execute_script,
            scripts::commands::test_script,
            runtime::commands::runtime_start,
            runtime::commands::runtime_stop,
            runtime::commands::get_runtime_state,
            chat_commands::delete_chat_message,
            chat_commands::timeout_user,
            chat_commands::ban_user,
            database::read_startup_sql,
            database::write_startup_sql,
            database::run_startup_sql,
            git::git_get_status,
            git::git_commit,
            git::git_reset,
            git::git_checkout_revision,
            ai_agents::commands::list_ai_agents,
            ai_agents::commands::set_ai_agent,
            ai_agents::commands::delete_ai_agent,
            render_metrics,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}

#[tauri::command]
fn render_metrics(metrics: State<'_, PrometheusHandle>) -> Result<Vec<String>, CommandError> {
    Ok(metrics.render().lines().map(String::from).collect())
}
