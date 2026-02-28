//! Commands for loading and saving the channels list to channels.json.

use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::config::expand_tilde;
use crate::setup::CommandError;
use crate::Config;

/// Loads channels from a path (sync). Returns an empty vec if the file does not exist or parse fails.
pub fn load_channels_from_path(path: &Path) -> Vec<Channel> {
    if !path.exists() {
        return Vec::new();
    }
    let mut file = match OpenOptions::new().read(true).open(path) {
        Ok(f) => f,
        Err(e) => {
            tracing::warn!("Failed to open channels file {:?}: {}", path, e);
            return Vec::new();
        }
    };
    let mut contents = String::new();
    if file.read_to_string(&mut contents).is_err() {
        return Vec::new();
    }
    let contents = contents.trim();
    if contents.is_empty() {
        return Vec::new();
    }
    serde_json::from_str(contents).unwrap_or_else(|e| {
        tracing::warn!("Failed to parse channels file {:?}: {}", path, e);
        Vec::new()
    })
}

/// A Twitch channel stored in the channels list.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Channel {
    /// Twitch login (username) of the channel.
    pub login: String,
    /// Optional display name for the UI.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

/// Loads the channels list from the configured channels file.
/// Returns an empty vec if the file does not exist or is empty.
#[tauri::command]
pub async fn load_channels(config: State<'_, Config>) -> Result<Vec<Channel>, CommandError> {
    let path = expand_tilde(&config.channels);

    if !path.exists() {
        tracing::debug!("Channels file does not exist at {:?}", path);
        return Ok(Vec::new());
    }

    let mut file = OpenOptions::new()
        .read(true)
        .open(&path)
        .map_err(|e| CommandError {
            message: format!("Failed to open channels file: {}", e),
        })?;

    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .map_err(|e| CommandError {
            message: format!("Failed to read channels file: {}", e),
        })?;

    let contents = contents.trim();
    if contents.is_empty() {
        tracing::debug!("Channels file is empty at {:?}", path);
        return Ok(Vec::new());
    }

    let channels: Vec<Channel> = serde_json::from_str(contents).map_err(|e| CommandError {
        message: format!("Invalid channels file: {}", e),
    })?;

    tracing::debug!("Loaded {} channels from {:?}", channels.len(), path);
    Ok(channels)
}

/// Saves the channels list to the configured channels file.
/// Rejects the save if any channel login is duplicated (case-insensitive).
#[tauri::command]
pub async fn save_channels(
    channels: Vec<Channel>,
    config: State<'_, Config>,
) -> Result<(), CommandError> {
    let path = expand_tilde(&config.channels);

    let mut seen = HashSet::new();
    for channel in &channels {
        let login_normalized = channel.login.to_lowercase();
        if !seen.insert(login_normalized) {
            return Err(CommandError {
                message: format!(
                    "Duplicate channel: '{}'. Each channel can only appear once.",
                    channel.login
                ),
            });
        }
    }

    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| CommandError {
                message: format!("Failed to create channels directory: {}", e),
            })?;
        }
    }

    let json = serde_json::to_string_pretty(&channels).map_err(|e| CommandError {
        message: format!("Failed to serialize channels: {}", e),
    })?;

    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&path)
        .map_err(|e| CommandError {
            message: format!("Failed to open channels file for writing: {}", e),
        })?;

    file.write_all(json.as_bytes()).map_err(|e| CommandError {
        message: format!("Failed to write channels file: {}", e),
    })?;

    tracing::info!("Saved {} channels to {:?}", channels.len(), path);
    Ok(())
}
