use std::fs::OpenOptions;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use securestore::{KeySource, SecretsManager};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::secrets::{SecretsError, SecretsProvider};

/// Polling interval for timeout-aware lock acquisition.
const LOCK_POLL_INTERVAL: Duration = Duration::from_millis(1);

/// Configuration specific to the securestore backend.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SecureStoreConfig {
    /// Path to the secrets JSON file.
    pub secrets_path: PathBuf,

    /// Path to the encryption key file.
    pub key_path: PathBuf,
}

impl From<securestore::Error> for SecretsError {
    fn from(error: securestore::Error) -> Self {
        SecretsError::StorageBackend(error.to_string())
    }
}

/// A secrets provider implementation using securestore.
///
/// All write operations are synchronized to disk before completion
/// and respect the configured timeout.
pub struct SecureStoreProvider {
    manager: Arc<RwLock<SecretsManager>>,
    store_config: SecureStoreConfig,
    write_timeout: Duration,
}

impl SecureStoreProvider {
    /// Creates a new SecureStoreProvider by loading an existing secrets vault.
    ///
    /// Returns an error if the vault cannot be loaded or decrypted.
    pub fn load(
        store_config: SecureStoreConfig,
        write_timeout: Duration,
    ) -> Result<Self, SecretsError> {
        let manager = SecretsManager::load(
            &store_config.secrets_path,
            KeySource::Path(&store_config.key_path),
        )?;

        Ok(Self {
            manager: Arc::new(RwLock::new(manager)),
            store_config,
            write_timeout,
        })
    }

    /// Creates a new SecureStoreProvider with a fresh vault.
    ///
    /// The vault will be saved to the configured path. If a key file doesn't exist,
    /// one will be generated and exported.
    pub fn create_new(
        store_config: SecureStoreConfig,
        write_timeout: Duration,
    ) -> Result<Self, SecretsError> {
        let manager = if store_config.key_path.exists() {
            SecretsManager::new(KeySource::Path(&store_config.key_path))?
        } else {
            let manager = SecretsManager::new(KeySource::Csprng)?;
            manager.export_key(&store_config.key_path)?;
            manager
        };

        manager.save_as(&store_config.secrets_path)?;
        sync_file_to_disk(&store_config.secrets_path)?;

        // Reload the manager so that save() works (securestore requires load() for save() to work)
        let manager = SecretsManager::load(
            &store_config.secrets_path,
            KeySource::Path(&store_config.key_path),
        )?;

        Ok(Self {
            manager: Arc::new(RwLock::new(manager)),
            store_config,
            write_timeout,
        })
    }

    /// Attempts to acquire a read lock with timeout using polling.
    fn try_read_with_deadline(
        &self,
        deadline: Instant,
        timeout: Duration,
    ) -> Result<tokio::sync::RwLockReadGuard<'_, SecretsManager>, SecretsError> {
        loop {
            if let Ok(guard) = self.manager.try_read() {
                return Ok(guard);
            }
            if Instant::now() >= deadline {
                return Err(SecretsError::Timeout(timeout));
            }
            std::thread::sleep(LOCK_POLL_INTERVAL);
        }
    }

    /// Attempts to acquire a write lock with timeout using polling.
    fn try_write_with_deadline(
        &self,
        deadline: Instant,
        timeout: Duration,
    ) -> Result<tokio::sync::RwLockWriteGuard<'_, SecretsManager>, SecretsError> {
        loop {
            if let Ok(guard) = self.manager.try_write() {
                return Ok(guard);
            }
            if Instant::now() >= deadline {
                return Err(SecretsError::Timeout(timeout));
            }
            std::thread::sleep(LOCK_POLL_INTERVAL);
        }
    }

    /// Saves the vault and ensures it's synced to disk with timeout.
    ///
    /// Note: The actual save and fsync operations cannot be interrupted once
    /// started, but lock acquisition respects the deadline.
    fn save_and_sync_with_deadline(
        &self,
        deadline: Instant,
        timeout: Duration,
    ) -> Result<(), SecretsError> {
        let guard = self.try_read_with_deadline(deadline, timeout)?;
        guard.save()?;
        drop(guard);

        if Instant::now() >= deadline {
            return Err(SecretsError::Timeout(timeout));
        }

        sync_file_to_disk(&self.store_config.secrets_path)?;
        Ok(())
    }
}

impl SecretsProvider for SecureStoreProvider {
    /// Retrieves a secret by name from the encrypted vault.
    fn get(&self, name: &str) -> Result<String, SecretsError> {
        let timeout = self.write_timeout;
        let deadline = Instant::now() + timeout;

        let guard = self.try_read_with_deadline(deadline, timeout)?;

        match guard.get(name) {
            Ok(value) => Ok(value),
            Err(error) => {
                if matches!(error.kind(), securestore::ErrorKind::SecretNotFound) {
                    Err(SecretsError::NotFound(name.to_string()))
                } else {
                    Err(SecretsError::from(error))
                }
            }
        }
    }

    /// Stores a secret in the encrypted vault.
    ///
    /// The vault is saved and synced to disk before returning.
    fn set(&self, name: &str, value: &str) -> Result<(), SecretsError> {
        let timeout = self.write_timeout;
        let deadline = Instant::now() + timeout;

        {
            let mut guard = self.try_write_with_deadline(deadline, timeout)?;
            guard.set(name, value);
        }

        self.save_and_sync_with_deadline(deadline, timeout)?;

        Ok(())
    }

    /// Deletes a secret from the encrypted vault.
    ///
    /// Returns the previous value if it existed. The vault is saved and
    /// synced to disk only if the secret was present.
    fn delete(&self, name: &str) -> Result<Option<String>, SecretsError> {
        let timeout = self.write_timeout;
        let deadline = Instant::now() + timeout;

        let previous_value = {
            let mut guard = self.try_write_with_deadline(deadline, timeout)?;
            let previous = guard.get(name).ok();
            if previous.is_some() {
                guard.remove(name)?;
            }
            previous
        };

        if previous_value.is_some() {
            self.save_and_sync_with_deadline(deadline, timeout)?;
        }

        Ok(previous_value)
    }

    /// Lists all secret names in the encrypted vault.
    fn list(&self) -> Result<Vec<String>, SecretsError> {
        let timeout = self.write_timeout;
        let deadline = Instant::now() + timeout;

        let guard = self.try_read_with_deadline(deadline, timeout)?;
        Ok(guard.keys().map(|s| s.to_string()).collect())
    }
}

/// Syncs a file to disk by opening it and calling sync_all.
///
/// On Windows we skip this: the securestore backend has just written the file and may still
/// hold it open, so opening it again often fails with "Access is denied". The data is already
/// written; we only lose an explicit flush-to-disk step.
fn sync_file_to_disk(path: &PathBuf) -> Result<(), std::io::Error> {
    #[cfg(windows)]
    {
        let _ = path;
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        let file = OpenOptions::new().read(true).open(path)?;
        file.sync_all()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_provider(temp_dir: &TempDir) -> SecureStoreProvider {
        let config = SecureStoreConfig {
            secrets_path: temp_dir.path().join("secrets.json"),
            key_path: temp_dir.path().join("secrets.key"),
        };
        let timeout = Duration::from_secs(5);

        SecureStoreProvider::create_new(config, timeout).expect("failed to create provider")
    }

    fn load_test_provider(temp_dir: &TempDir) -> SecureStoreProvider {
        let config = SecureStoreConfig {
            secrets_path: temp_dir.path().join("secrets.json"),
            key_path: temp_dir.path().join("secrets.key"),
        };
        let timeout = Duration::from_secs(5);

        SecureStoreProvider::load(config, timeout).expect("failed to load provider")
    }

    #[test]
    fn test_create_new_generates_key_file() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let key_path = temp_dir.path().join("secrets.key");

        assert!(!key_path.exists());
        let _provider = create_test_provider(&temp_dir);
        assert!(key_path.exists());
    }

    #[test]
    fn test_create_new_generates_secrets_file() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let secrets_path = temp_dir.path().join("secrets.json");

        assert!(!secrets_path.exists());
        let _provider = create_test_provider(&temp_dir);
        assert!(secrets_path.exists());
    }

    #[test]
    fn test_set_and_get_secret() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let provider = create_test_provider(&temp_dir);

        provider
            .set("test_key", "test_value")
            .expect("failed to set secret");
        let value = provider.get("test_key").expect("failed to get secret");

        assert_eq!(value, "test_value");
    }

    #[test]
    fn test_get_nonexistent_secret_returns_not_found() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let provider = create_test_provider(&temp_dir);

        let result = provider.get("nonexistent");

        assert!(matches!(result, Err(SecretsError::NotFound(_))));
    }

    #[test]
    fn test_set_overwrites_existing_secret() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let provider = create_test_provider(&temp_dir);

        provider.set("key", "value1").expect("failed to set secret");
        provider
            .set("key", "value2")
            .expect("failed to overwrite secret");
        let value = provider.get("key").expect("failed to get secret");

        assert_eq!(value, "value2");
    }

    #[test]
    fn test_delete_returns_previous_value() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let provider = create_test_provider(&temp_dir);

        provider.set("key", "value").expect("failed to set secret");
        let deleted = provider.delete("key").expect("failed to delete secret");

        assert_eq!(deleted, Some("value".to_string()));
    }

    #[test]
    fn test_delete_nonexistent_returns_none() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let provider = create_test_provider(&temp_dir);

        let deleted = provider
            .delete("nonexistent")
            .expect("failed to delete secret");

        assert_eq!(deleted, None);
    }

    #[test]
    fn test_delete_removes_secret() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let provider = create_test_provider(&temp_dir);

        provider.set("key", "value").expect("failed to set secret");
        provider.delete("key").expect("failed to delete secret");
        let result = provider.get("key");

        assert!(matches!(result, Err(SecretsError::NotFound(_))));
    }

    #[test]
    fn test_list_empty_vault() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let provider = create_test_provider(&temp_dir);

        let keys = provider.list().expect("failed to list secrets");

        assert!(keys.is_empty());
    }

    #[test]
    fn test_list_returns_all_keys() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");
        let provider = create_test_provider(&temp_dir);

        provider
            .set("key1", "value1")
            .expect("failed to set secret");
        provider
            .set("key2", "value2")
            .expect("failed to set secret");
        provider
            .set("key3", "value3")
            .expect("failed to set secret");

        let mut keys = provider.list().expect("failed to list secrets");
        keys.sort();

        assert_eq!(keys, vec!["key1", "key2", "key3"]);
    }

    #[test]
    fn test_secrets_persist_after_reload() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");

        {
            let provider = create_test_provider(&temp_dir);
            provider
                .set("persistent_key", "persistent_value")
                .expect("failed to set secret");
        }

        let provider = load_test_provider(&temp_dir);
        let value = provider
            .get("persistent_key")
            .expect("failed to get secret");

        assert_eq!(value, "persistent_value");
    }

    #[test]
    fn test_deleted_secrets_stay_deleted_after_reload() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");

        {
            let provider = create_test_provider(&temp_dir);
            provider.set("key", "value").expect("failed to set secret");
            provider.delete("key").expect("failed to delete secret");
        }

        let provider = load_test_provider(&temp_dir);
        let result = provider.get("key");

        assert!(matches!(result, Err(SecretsError::NotFound(_))));
    }

    #[test]
    fn test_load_with_existing_key_file() {
        let temp_dir = TempDir::new().expect("failed to create temp dir");

        let _provider = create_test_provider(&temp_dir);

        let config = SecureStoreConfig {
            secrets_path: temp_dir.path().join("secrets2.json"),
            key_path: temp_dir.path().join("secrets.key"),
        };
        let timeout = Duration::from_secs(5);

        let provider =
            SecureStoreProvider::create_new(config, timeout).expect("failed to create provider");
        provider.set("key", "value").expect("failed to set secret");

        let value = provider.get("key").expect("failed to get secret");
        assert_eq!(value, "value");
    }
}
