use std::{
    fs::OpenOptions,
    io::{Read, Write},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

/// Application configuration for Clawdia.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Config {
    /// Path to the DuckDB database file.
    pub database: PathBuf,
    /// Path to the encryption key used for the secrets store.
    pub secrets_key: PathBuf,
    /// Path to the encrypted secrets JSON file.
    pub secrets: PathBuf,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            database: "~/.clawdia/user.duckdb".into(),
            secrets_key: "~/.clawdia/secrets.key".into(),
            secrets: "~/.clawdia/secrets.json".into(),
        }
    }
}

impl Config {
    /// Loads a configuration from a JSON file at the given path.
    pub fn load_from<P: AsRef<Path>>(path: P) -> std::io::Result<Self> {
        let mut file = OpenOptions::new().read(true).open(path.as_ref())?;
        let mut bytes = vec![];
        let _ = file.read_to_end(&mut bytes)?;
        let jason: Self = serde_json::from_slice(&bytes)?;
        Ok(jason)
    }

    /// Writes the default configuration as pretty-printed JSON to the given path.
    pub fn write_default_to<P: AsRef<Path>>(path: P) -> std::io::Result<()> {
        let config = Self::default();
        let json = serde_json::to_string_pretty(&config)?;
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(path.as_ref())?;
        file.write_all(json.as_bytes())
    }
}
