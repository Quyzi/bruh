use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;

use serde_json::Value;
use tauri::State;

use crate::config::expand_tilde;
use crate::setup::CommandError;
use crate::Config;

/// Loads the workflow as raw JSON from the given path (sync). Returns None if file does not exist or is empty.
pub fn load_workflow_from_path(path: &Path) -> Result<Option<Value>, CommandError> {
    if !path.exists() {
        return Ok(None);
    }
    let mut file = OpenOptions::new()
        .read(true)
        .open(path)
        .map_err(|e| CommandError {
            message: format!("Failed to open workflow file: {}", e),
        })?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| CommandError {
            message: format!("Failed to read workflow file: {}", e),
        })?;
    let contents = contents.trim();
    if contents.is_empty() {
        return Ok(None);
    }
    let workflow: Value = serde_json::from_str(contents).map_err(|error| CommandError {
        message: format!("Invalid workflow file: {}", error),
    })?;
    Ok(Some(workflow))
}

/// Saves the workflow graph to the configured workflow file and updates the executor's in-memory workflow.
#[tauri::command]
pub async fn save_workflow(
    workflow: Value,
    config: State<'_, Config>,
    executor: State<'_, std::sync::Arc<tokio::sync::RwLock<crate::executor::Executor>>>,
) -> Result<(), CommandError> {
    let path = expand_tilde(&config.workflow);

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| CommandError {
                message: format!("Failed to create workflow directory: {}", e),
            })?;
        }
    }

    let json = serde_json::to_string_pretty(&workflow).map_err(|e| CommandError {
        message: format!("Failed to serialize workflow: {}", e),
    })?;

    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| CommandError {
            message: format!("Failed to open workflow file: {}", e),
        })?;

    file.write_all(json.as_bytes()).map_err(|e| CommandError {
        message: format!("Failed to write workflow file: {}", e),
    })?;

    let exec = executor.inner().clone();
    let guard = exec.write().await;
    *guard.workflow.write().await = workflow;

    tracing::info!("Workflow saved to {:?}", path);
    Ok(())
}

/// Loads the workflow as raw JSON from the configured workflow file.
/// Returns None if the file doesn't exist or is empty.
#[tauri::command]
pub async fn load_workflow(config: State<'_, Config>) -> Result<Option<Value>, CommandError> {
    let path = expand_tilde(&config.workflow);

    if !path.exists() {
        tracing::debug!("Workflow file does not exist at {:?}", path);
        return Ok(None);
    }

    let mut file = OpenOptions::new()
        .read(true)
        .open(&path)
        .map_err(|e| CommandError {
            message: format!("Failed to open workflow file: {}", e),
        })?;

    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| CommandError {
            message: format!("Failed to read workflow file: {}", e),
        })?;

    let contents = contents.trim();
    if contents.is_empty() {
        tracing::debug!("Workflow file is empty at {:?}", path);
        return Ok(None);
    }

    let workflow: Value = serde_json::from_str(contents).map_err(|error| CommandError {
        message: format!("Invalid workflow file: {}", error),
    })?;

    tracing::info!("Workflow loaded from {:?}", path);
    Ok(Some(workflow))
}
