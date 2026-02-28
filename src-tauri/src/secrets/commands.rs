use tauri::State;

use crate::{setup::CommandError, Secrets};

use super::SecretsProvider;

/// Lists all secret names in the store.
#[tauri::command]
pub async fn list_secrets(secrets: State<'_, Secrets>) -> Result<Vec<String>, CommandError> {
    let secrets = secrets.inner().clone();
    secrets.list().map_err(Into::into)
}

/// Retrieves a secret value by name.
#[tauri::command]
pub async fn get_secret(name: String, secrets: State<'_, Secrets>) -> Result<String, CommandError> {
    let secrets = secrets.inner().clone();
    secrets.get(&name).map_err(Into::into)
}

/// Stores a secret with the given name and value.
#[tauri::command]
pub async fn set_secret(
    name: String,
    value: String,
    secrets: State<'_, Secrets>,
) -> Result<(), CommandError> {
    let secrets = secrets.inner().clone();

    if name.trim().is_empty() {
        return Err(CommandError {
            message: "Secret name cannot be empty".to_string(),
        });
    }

    if value.is_empty() {
        return Err(CommandError {
            message: "Secret value cannot be empty".to_string(),
        });
    }

    secrets.set(name.trim(), &value)?;
    tracing::info!("Secret '{}' saved", name.trim());
    Ok(())
}

/// Deletes a secret by name.
#[tauri::command]
pub async fn delete_secret(name: String, secrets: State<'_, Secrets>) -> Result<(), CommandError> {
    let secrets = secrets.inner().clone();

    secrets.delete(&name)?;
    tracing::info!("Secret '{}' deleted", name);
    Ok(())
}
