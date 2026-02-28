//! Commands for reading, writing, and running the startup.sql file in the database directory.

use std::fs;
use std::path::PathBuf;

use tauri::State;

use crate::config::expand_tilde;
use crate::setup::CommandError;
use crate::{Config, Database};

/// Path to startup.sql: same directory as the database file (~/.bruh/startup.sql by default).
fn startup_sql_path(config: &Config) -> PathBuf {
    let expanded = expand_tilde(&config.database);
    match expanded.parent() {
        Some(parent) => parent.join("startup.sql"),
        None => expand_tilde(PathBuf::from("~/.bruh")).join("startup.sql"),
    }
}

/// Reads the contents of startup.sql. Returns an empty string if the file does not exist.
#[tauri::command]
pub async fn read_startup_sql(config: State<'_, Config>) -> Result<String, CommandError> {
    let path = startup_sql_path(&config);
    if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| CommandError {
            message: format!("Failed to read startup.sql: {}", e),
        })?;
        Ok(content)
    } else {
        Ok(String::new())
    }
}

/// Writes the contents of startup.sql. Creates the parent directory if needed.
#[tauri::command]
pub async fn write_startup_sql(
    content: String,
    config: State<'_, Config>,
) -> Result<(), CommandError> {
    let path = startup_sql_path(&config);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| CommandError {
                message: format!("Failed to create directory for startup.sql: {}", e),
            })?;
        }
    }
    fs::write(&path, content).map_err(|e| CommandError {
        message: format!("Failed to write startup.sql: {}", e),
    })?;
    Ok(())
}

/// Runs the given SQL against the database (e.g. for extensions or DDL). Uses execute_batch for multiple statements.
#[tauri::command]
pub async fn run_startup_sql(
    content: String,
    database: State<'_, Database>,
) -> Result<(), CommandError> {
    let sql = content.trim();
    if sql.is_empty() {
        return Ok(());
    }
    let sql_owned = sql.to_string();
    database
        .conn(move |conn| conn.execute_batch(&sql_owned))
        .await
        .map_err(|e| CommandError {
            message: format!("Failed to run SQL: {}", e),
        })?;
    Ok(())
}
