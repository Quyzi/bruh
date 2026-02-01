// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use clawdia_lib::config::expand_tilde;
use clawdia_lib::secrets::{SecureStoreConfig, SecureStoreProvider};
use clawdia_lib::{Config, Database};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt().init();

    let config = Config::load_or_create_default()?;
    let secrets = load_or_create_secrets(&config)?;
    let db = load_or_create_db(&config).await?;

    clawdia_lib::run(config, secrets, db)
}

fn load_or_create_secrets(config: &Config) -> Result<Arc<SecureStoreProvider>> {
    let store_config = SecureStoreConfig {
        secrets_path: expand_tilde(&config.secrets),
        key_path: expand_tilde(&config.secrets_key),
    };
    let write_timeout = Duration::from_secs(5);

    let provider = if store_config.secrets_path.exists() {
        tracing::info!("Loading existing secrets store");
        SecureStoreProvider::load(store_config, write_timeout)?
    } else {
        tracing::info!("Creating new secrets store");
        SecureStoreProvider::create_new(store_config, write_timeout)?
    };

    Ok(Arc::new(provider))
}

async fn load_or_create_db(config: &Config) -> Result<Database> {
    let db_path = expand_tilde(&config.database);

    if let Some(parent) = db_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let is_new = !db_path.exists();
    let client = async_duckdb::ClientBuilder::new()
        .path(&config.database)
        .open()
        .await?;

    let _ = &client
        .conn(|conn| {
            static QUERY: &str = "CALL start_ui_server();";
            conn.execute(QUERY, [])
        })
        .await?;
    tracing::info!("Started duckdb ui at http://localhost:4213");

    if is_new {
        tracing::info!("Created new DuckDB database at {:?}", db_path);
    } else {
        tracing::info!("Loaded existing DuckDB database from {:?}", db_path);
    }

    Ok(Arc::new(client))
}
