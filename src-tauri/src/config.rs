use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Failed to create config directory '{path}'")]
    CreateDir {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("Failed to read config from '{path}'")]
    Read {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("Failed to write config to '{path}'")]
    Write {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("Failed to parse config from '{path}'")]
    Parse {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
}

/// Application configuration for Clawdia.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Config {
    /// Path to the DuckDB database file.
    pub database: PathBuf,
    /// Path to the encryption key used for the secrets store.
    pub secrets_key: PathBuf,
    /// Path to the encrypted secrets JSON file.
    pub secrets: PathBuf,
    /// Path to the workflow JSON file.
    #[serde(default = "default_workflow_path")]
    pub workflow: PathBuf,
}

fn default_workflow_path() -> PathBuf {
    "~/.clawdia/workflow.json".into()
}

impl Default for Config {
    fn default() -> Self {
        Self {
            database: "~/.clawdia/user.duckdb".into(),
            secrets_key: "~/.clawdia/secrets.key".into(),
            secrets: "~/.clawdia/secrets.json".into(),
            workflow: default_workflow_path(),
        }
    }
}

/// Default path for the config file.
pub const CONFIG_PATH: &str = "~/.clawdia/config.json";

impl Config {
    /// Loads a configuration from a JSON file at the given path.
    pub fn load_from<P: AsRef<Path>>(path: P) -> Result<Self, ConfigError> {
        let path = path.as_ref();
        let mut file = OpenOptions::new()
            .read(true)
            .open(path)
            .map_err(|e| ConfigError::Read {
                path: path.to_path_buf(),
                source: e,
            })?;
        let mut bytes = vec![];
        file.read_to_end(&mut bytes)
            .map_err(|e| ConfigError::Read {
                path: path.to_path_buf(),
                source: e,
            })?;
        serde_json::from_slice(&bytes).map_err(|e| ConfigError::Parse {
            path: path.to_path_buf(),
            source: e,
        })
    }

    /// Writes the default configuration as pretty-printed JSON to the given path.
    pub fn write_default_to<P: AsRef<Path>>(path: P) -> Result<(), ConfigError> {
        let path = path.as_ref();
        let config = Self::default();
        let json = serde_json::to_string_pretty(&config).map_err(|e| ConfigError::Parse {
            path: path.to_path_buf(),
            source: e,
        })?;
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(path)
            .map_err(|e| ConfigError::Write {
                path: path.to_path_buf(),
                source: e,
            })?;
        file.write_all(json.as_bytes())
            .map_err(|e| ConfigError::Write {
                path: path.to_path_buf(),
                source: e,
            })
    }

    /// Loads the config from `~/.clawdia/config.json`, creating the directory
    /// and a default config file if they don't exist.
    #[tracing::instrument]
    pub fn load_or_create_default() -> Result<Self, ConfigError> {
        let path = expand_tilde(CONFIG_PATH);

        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| ConfigError::CreateDir {
                    path: parent.to_path_buf(),
                    source: e,
                })?;
            }
        }

        if path.exists() {
            Self::load_from(&path)
        } else {
            Self::write_default_to(&path)?;
            Ok(Self::default())
        }
    }
}

/// Expands a leading `~` to the user's home directory.
pub fn expand_tilde<P: AsRef<Path>>(path: P) -> PathBuf {
    let path = path.as_ref();
    if let Ok(stripped) = path.strip_prefix("~") {
        if let Ok(home) = homedir::my_home() {
            if let Some(home) = home {
                return home.join(stripped);
            }
        }
    }
    path.to_path_buf()
}
