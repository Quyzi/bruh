use serde::Serialize;
use tauri::State;
use twitch_api::{twitch_oauth2::AppAccessToken, HelixClient};

use crate::{
    auth::{SECRET_TWITCH_CLIENT_ID, SECRET_TWITCH_CLIENT_SECRET},
    secrets::{SecretsError, SecretsProvider},
    Secrets,
};

/// Serializable error type for Tauri commands.
#[derive(Debug, Serialize)]
pub struct CommandError {
    pub message: String,
}

impl From<SecretsError> for CommandError {
    fn from(err: SecretsError) -> Self {
        CommandError {
            message: err.to_string(),
        }
    }
}

/// Status of the initial setup configuration.
#[derive(Debug, Serialize)]
pub struct SetupStatus {
    pub twitch_configured: bool,
}

/// Result of testing Twitch credentials.
#[derive(Debug, Serialize)]
pub struct TestResult {
    pub success: bool,
    pub message: String,
}

/// Returns the current setup status, indicating which credentials are configured.
#[tauri::command]
pub async fn get_setup_status(secrets: State<'_, Secrets>) -> Result<SetupStatus, CommandError> {
    let secrets = secrets.inner().clone();

    let has_client_id = secrets.get(SECRET_TWITCH_CLIENT_ID).is_ok();
    let has_client_secret = secrets.get(SECRET_TWITCH_CLIENT_SECRET).is_ok();

    Ok(SetupStatus {
        twitch_configured: has_client_id && has_client_secret,
    })
}

/// Saves Twitch credentials to the secrets store.
#[tauri::command]
pub async fn save_twitch_credentials(
    client_id: String,
    client_secret: String,
    secrets: State<'_, Secrets>,
) -> Result<(), CommandError> {
    let secrets = secrets.inner().clone();

    if client_id.trim().is_empty() {
        return Err(CommandError {
            message: "Client ID cannot be empty".to_string(),
        });
    }

    if client_secret.trim().is_empty() {
        return Err(CommandError {
            message: "Client Secret cannot be empty".to_string(),
        });
    }

    secrets.set(SECRET_TWITCH_CLIENT_ID, client_id.trim())?;
    secrets.set(SECRET_TWITCH_CLIENT_SECRET, client_secret.trim())?;

    tracing::info!("Twitch credentials saved successfully");
    Ok(())
}

/// Tests Twitch credentials by attempting to obtain an app access token.
#[tauri::command]
pub async fn test_twitch_credentials(
    secrets: State<'_, Secrets>,
) -> Result<TestResult, CommandError> {
    let secrets = secrets.inner().clone();

    let client_id = match secrets.get(SECRET_TWITCH_CLIENT_ID) {
        Ok(id) => id,
        Err(SecretsError::NotFound(_)) => {
            return Ok(TestResult {
                success: false,
                message: "Twitch Client ID is not configured".to_string(),
            });
        }
        Err(e) => return Err(e.into()),
    };

    let client_secret = match secrets.get(SECRET_TWITCH_CLIENT_SECRET) {
        Ok(secret) => secret,
        Err(SecretsError::NotFound(_)) => {
            return Ok(TestResult {
                success: false,
                message: "Twitch Client Secret is not configured".to_string(),
            });
        }
        Err(e) => return Err(e.into()),
    };

    let helix_client: HelixClient<'static, reqwest::Client> = HelixClient::default();

    match AppAccessToken::get_app_access_token(
        &helix_client,
        client_id.into(),
        client_secret.into(),
        vec![],
    )
    .await
    {
        Ok(_token) => {
            tracing::info!("Twitch credentials validated successfully");
            Ok(TestResult {
                success: true,
                message: "Successfully authenticated with Twitch".to_string(),
            })
        }
        Err(e) => {
            tracing::warn!("Twitch credential validation failed: {}", e);
            Ok(TestResult {
                success: false,
                message: format!("Authentication failed: {}", e),
            })
        }
    }
}
