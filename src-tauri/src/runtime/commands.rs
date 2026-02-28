//! Runtime Tauri commands: workflow load/save and runtime start/stop/state.

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Arc;

use serde_json::Value;
use tauri::State;
use tokio::sync::RwLock;

use crate::config::expand_tilde;
use crate::runtime::{Runtime, RuntimeState};
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

/// Saves the workflow graph to the configured workflow file and updates the runtime's in-memory workflow.
#[tauri::command]
pub async fn save_workflow(
    workflow: Value,
    config: State<'_, Config>,
    runtime: State<'_, Arc<RwLock<Runtime>>>,
) -> Result<(), CommandError> {
    let path = expand_tilde(&config.workflow);

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

    let run = runtime.inner().clone();
    let guard = run.write().await;
    *guard.workflow.write().await = workflow;
    let _ = guard.event_sub_reconnect_tx.send(());
    drop(guard);

    tracing::info!("Workflow saved to {:?}", path);
    Ok(())
}

/// Loads the workflow as raw JSON from the configured workflow file.
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

/// Tauri command: starts the runtime (token refresher and EventSub).
#[tauri::command]
pub async fn runtime_start(
    app: tauri::AppHandle,
    runtime: State<'_, Arc<RwLock<Runtime>>>,
) -> Result<(), CommandError> {
    let run = runtime.inner().clone();
    let mut guard = run.write().await;
    guard.start(app).await.map_err(|e| CommandError {
        message: format!("Failed to start runtime: {}", e),
    })
}

/// Tauri command: stops the runtime and aborts background tasks.
#[tauri::command]
pub async fn runtime_stop(runtime: State<'_, Arc<RwLock<Runtime>>>) -> Result<(), CommandError> {
    let run = runtime.inner().clone();
    let mut guard = run.write().await;
    guard.stop().await;
    Ok(())
}

/// Tauri command: returns the current runtime state (stopped or running).
#[tauri::command]
pub async fn get_runtime_state(
    runtime: State<'_, Arc<RwLock<Runtime>>>,
) -> Result<RuntimeState, CommandError> {
    let run = runtime.inner().clone();
    let guard = run.read().await;
    let state_value = *guard.state.read().await;
    Ok(state_value)
}
