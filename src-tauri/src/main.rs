// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use bruh_lib::config::expand_tilde;
use bruh_lib::secrets::{SecureStoreConfig, SecureStoreProvider};
use bruh_lib::{Config, Database};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};

const METRICS_UPKEEP_DURATION: Duration = Duration::from_secs(10 * 60);

#[tokio::main]
async fn main() -> Result<()> {
    // Set rustls crypto provider before any TLS use (reqwest, tungstenite, etc.).
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let config = Config::load_or_create_default()?;
    let secrets = load_or_create_secrets(&config)?;
    let db = load_or_create_db(&config).await?;
    let metrics = setup_metrics()?;

    bruh_lib::run(config, secrets, db, metrics)
}

fn setup_metrics() -> Result<PrometheusHandle> {
    let handle = PrometheusBuilder::new().install_recorder()?;

    let upkeep_handle = handle.clone();
    tokio::spawn(async move {
        let handle = upkeep_handle;
        loop {
            tokio::time::sleep(METRICS_UPKEEP_DURATION).await;
            handle.run_upkeep();
        }
    });

    Ok(handle)
}

fn load_or_create_secrets(config: &Config) -> Result<Arc<SecureStoreProvider>> {
    let store_config = SecureStoreConfig {
        secrets_path: expand_tilde(&config.secrets),
        key_path: expand_tilde(&config.secrets_key),
    };
    let write_timeout = Duration::from_secs(5);

    for path in [&store_config.secrets_path, &store_config.key_path] {
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)?;
            }
        }
    }

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

    let startup_path = match db_path.parent() {
        Some(parent) => parent.join("startup.sql"),
        None => expand_tilde(PathBuf::from("~/.bruh")).join("startup.sql"),
    };
    if startup_path.exists() {
        let contents = std::fs::read_to_string(&startup_path)?;
        let sql = contents.trim();
        if !sql.is_empty() {
            let sql_owned = sql.to_string();
            client
                .conn(move |conn| conn.execute_batch(&sql_owned))
                .await?;
            tracing::info!("Executed startup.sql from {:?}", startup_path);
        }
    } else {
        tracing::debug!("startup.sql not found at {:?}, skipping", startup_path);
    }

    if is_new {
        tracing::info!("Created new DuckDB database at {:?}", db_path);
    } else {
        tracing::info!("Loaded existing DuckDB database from {:?}", db_path);
    }

    Ok(Arc::new(client))
}
