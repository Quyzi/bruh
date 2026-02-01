//! Commands for reading and writing Rhai scripts in the configured scripts directory.

use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::PathBuf;

use rhai::{Dynamic, Engine, Scope};
use rhai::serde::to_dynamic;
use tauri::State;

use crate::config::expand_tilde;
use crate::setup::CommandError;
use crate::Config;

const RHAI_EXT: &str = ".rhai";

/// Sanitizes a script name for use as a filename (alphanumeric, underscore, hyphen only).
fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == ' ' {
                if c == ' ' {
                    '_'
                } else {
                    c
                }
            } else {
                '_'
            }
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string()
}

fn script_path(config: &Config, name: &str) -> PathBuf {
    let sanitized = sanitize_name(name);
    if sanitized.is_empty() {
        return expand_tilde(&config.scripts).join("_unnamed".to_string() + RHAI_EXT);
    }
    expand_tilde(&config.scripts).join(sanitized + RHAI_EXT)
}

/// Lists script names (filename stems without .rhai) in the configured scripts directory.
#[tauri::command]
pub async fn list_scripts(config: State<'_, Config>) -> Result<Vec<String>, CommandError> {
    let dir = expand_tilde(&config.scripts);

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&dir).map_err(|e| CommandError {
        message: format!("Failed to read scripts directory: {}", e),
    })?;

    let mut names: Vec<String> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            if path.extension().map_or(false, |ext| ext == "rhai") {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .map(String::from)
            } else {
                None
            }
        })
        .collect();

    names.sort();
    Ok(names)
}

/// Reads the content of a script by name (without .rhai).
#[tauri::command]
pub async fn read_script(
    name: String,
    config: State<'_, Config>,
) -> Result<String, CommandError> {
    let path = script_path(&config, &name);

    if !path.exists() {
        return Err(CommandError {
            message: format!("Script '{}' not found", name),
        });
    }

    let mut file = OpenOptions::new()
        .read(true)
        .open(&path)
        .map_err(|e| CommandError {
            message: format!("Failed to open script: {}", e),
        })?;

    let mut content = String::new();
    file.read_to_string(&mut content)
        .map_err(|e| CommandError {
            message: format!("Failed to read script: {}", e),
        })?;

    Ok(content)
}

/// Writes a script by name (without .rhai). Creates the scripts directory if needed.
#[tauri::command]
pub async fn write_script(
    name: String,
    content: String,
    config: State<'_, Config>,
) -> Result<(), CommandError> {
    let path = script_path(&config, &name);

    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| CommandError {
                message: format!("Failed to create scripts directory: {}", e),
            })?;
        }
    }

    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| CommandError {
            message: format!("Failed to write script: {}", e),
        })?;

    file.write_all(content.as_bytes()).map_err(|e| CommandError {
        message: format!("Failed to write script file: {}", e),
    })?;

    tracing::debug!("Script written: {:?}", path);
    Ok(())
}

/// Deletes a script by name (without .rhai).
#[tauri::command]
pub async fn delete_script(
    name: String,
    config: State<'_, Config>,
) -> Result<(), CommandError> {
    let path = script_path(&config, &name);

    if !path.exists() {
        return Err(CommandError {
            message: format!("Script '{}' not found", name),
        });
    }

    fs::remove_file(&path).map_err(|e| CommandError {
        message: format!("Failed to delete script: {}", e),
    })?;

    tracing::debug!("Script deleted: {:?}", path);
    Ok(())
}

/// Renames a script (old name and new name without .rhai).
#[tauri::command]
pub async fn rename_script(
    old_name: String,
    new_name: String,
    config: State<'_, Config>,
) -> Result<(), CommandError> {
    let old_path = script_path(&config, &old_name);
    let new_path = script_path(&config, &new_name);

    if !old_path.exists() {
        return Err(CommandError {
            message: format!("Script '{}' not found", old_name),
        });
    }

    if new_path.exists() {
        return Err(CommandError {
            message: format!("A script named '{}' already exists", new_name),
        });
    }

    if let Some(parent) = new_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| CommandError {
                message: format!("Failed to create scripts directory: {}", e),
            })?;
        }
    }

    fs::rename(&old_path, &new_path).map_err(|e| CommandError {
        message: format!("Failed to rename script: {}", e),
    })?;

    tracing::debug!("Script renamed: {:?} -> {:?}", old_path, new_path);
    Ok(())
}

/// Executes a Rhai script by name with optional JSON input; returns the script result as JSON.
#[tauri::command]
pub async fn execute_script(
    name: String,
    input: Option<serde_json::Value>,
    config: State<'_, Config>,
) -> Result<serde_json::Value, CommandError> {
    let content = read_script(name.clone(), config).await?;

    let input_dynamic: Dynamic = to_dynamic(input.unwrap_or(serde_json::Value::Null))
        .map_err(|error| CommandError {
            message: format!("Invalid script input: {}", error),
        })?;

    let engine = Engine::new();
    let mut scope = Scope::new();
    scope.push("input", input_dynamic);

    let result: Dynamic = engine.eval_with_scope(&mut scope, &content).map_err(|error| {
        CommandError {
            message: format!("Script error: {}", error),
        }
    })?;

    let value = serde_json::to_value(&result).map_err(|error| CommandError {
        message: format!("Failed to serialize result: {}", error),
    })?;

    Ok(value)
}

/// Runs a script with optional JSON input and logs the result to the app log viewer.
#[tauri::command]
pub async fn test_script(
    name: String,
    input: Option<serde_json::Value>,
    config: State<'_, Config>,
) -> Result<(), CommandError> {
    match execute_script(name.clone(), input, config).await {
        Ok(result) => {
            let output = serde_json::to_string_pretty(&result)
                .unwrap_or_else(|_| format!("{:?}", result));
            tracing::info!(target: "script_test", script = %name, "Script test result:\n{}", output);
            Ok(())
        }
        Err(error) => {
            tracing::error!(target: "script_test", script = %name, "Script test error: {}", error.message);
            Err(error)
        }
    }
}
