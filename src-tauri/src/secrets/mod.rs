pub mod commands;
mod securestore;

pub use securestore::{SecureStoreConfig, SecureStoreProvider};

use std::time::Duration;

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Trait for providing secrets storage and retrieval functionality.
///
/// Implementations must be thread-safe.
pub trait SecretsProvider {
    /// Retrieves a secret by name.
    fn get(&self, name: &str) -> Result<String, SecretsError>;

    /// Stores a secret with the given name and value.
    fn set(&self, name: &str, value: &str) -> Result<(), SecretsError>;

    /// Deletes a secret by name, returning the previous value if it existed.
    fn delete(&self, name: &str) -> Result<Option<String>, SecretsError>;

    /// Lists all secret names in the store.
    fn list(&self) -> Result<Vec<String>, SecretsError>;
}

/// Errors that can occur during secrets operations.
#[derive(Debug, Error)]
pub enum SecretsError {
    #[error("secret not found: {0}")]
    NotFound(String),

    #[error("storage backend error: {0}")]
    StorageBackend(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("operation timed out after {0:?}")]
    Timeout(Duration),
}

/// Specifies which secrets provider backend to use.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SecretsProviderKind {
    /// Use securestore for encrypted local file storage.
    SecureStore(SecureStoreConfig),
}

/// Configuration for the secrets provider.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SecretsConfig {
    /// Which secrets provider backend to use.
    pub provider: SecretsProviderKind,

    /// Timeout duration for write operations in milliseconds.
    pub write_timeout_ms: u64,
}

impl SecretsConfig {
    /// Returns the write timeout as a Duration.
    pub fn write_timeout(&self) -> Duration {
        Duration::from_millis(self.write_timeout_ms)
    }
}
