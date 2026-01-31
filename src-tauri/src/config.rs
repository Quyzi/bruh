use std::{
    fs::OpenOptions,
    io::Read,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Config {
    pub database: PathBuf,
    pub secrets_key: PathBuf,
    pub secrets: PathBuf,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            database: "~/.clawdia/clawdia.duckdb".into(),
            secrets_key: "~/.clawdia/secrets.key".into(),
            secrets: "~/.clawdia/secrets.json".into(),
        }
    }
}

impl Config {
    pub fn load_from<P: AsRef<Path>>(path: P) -> std::io::Result<Self> {
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .open(path.as_ref())?;
        let mut bytes = vec![];
        let _ = file.read_to_end(&mut bytes)?;
        let jason: Self = serde_json::from_slice(&bytes)?;
        Ok(jason)
    }
}
