//! Setup commands for initial configuration and OAuth flow.

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::State;
use twitch_api::twitch_oauth2::TwitchToken;
use url::Url;

use crate::{
    auth::{
        clear_tokens_from_secrets, default_scopes, load_token_from_secrets, save_token_to_secrets,
        SECRET_TWITCH_ACCESS_TOKEN, SECRET_TWITCH_CLIENT_ID, SECRET_TWITCH_CLIENT_SECRET,
        SECRET_TWITCH_CSRF_TOKEN, SECRET_TWITCH_REFRESH_TOKEN, SECRET_TWITCH_SCOPES,
    },
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
#[serde(rename_all = "camelCase")]
pub struct SetupStatus {
    /// Whether Twitch client credentials are configured
    pub credentials_configured: bool,
    /// Whether the user has authorized the app (has valid tokens)
    pub user_authorized: bool,
    /// The Twitch username if authorized
    pub twitch_username: Option<String>,
}

/// Result of testing Twitch credentials.
#[derive(Debug, Serialize)]
pub struct TestResult {
    pub success: bool,
    pub message: String,
}

/// OAuth authorization URL response.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUrlResponse {
    pub url: String,
    pub csrf_token: String,
}

/// OAuth token exchange result.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenExchangeResult {
    pub success: bool,
    pub message: String,
    pub username: Option<String>,
}

/// Returns the current setup status, indicating which credentials are configured.
#[tauri::command]
pub async fn get_setup_status(secrets: State<'_, Secrets>) -> Result<SetupStatus, CommandError> {
    let secrets = secrets.inner().clone();

    let has_client_id = secrets.get(SECRET_TWITCH_CLIENT_ID).is_ok();
    let has_client_secret = secrets.get(SECRET_TWITCH_CLIENT_SECRET).is_ok();
    let credentials_configured = has_client_id && has_client_secret;

    // Check if we have stored tokens
    let has_access_token = secrets.get(SECRET_TWITCH_ACCESS_TOKEN).is_ok();
    let has_refresh_token = secrets.get(SECRET_TWITCH_REFRESH_TOKEN).is_ok();
    let user_authorized = has_access_token && has_refresh_token;

    // We don't validate the token here to avoid unnecessary API calls
    // The username will be fetched when the token is actually used

    Ok(SetupStatus {
        credentials_configured,
        user_authorized,
        twitch_username: None, // Will be set after validation
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

    // Clear any existing tokens since credentials changed
    clear_tokens_from_secrets(secrets.as_ref())?;

    tracing::info!("Twitch credentials saved successfully");
    Ok(())
}

/// Generates the OAuth authorization URL for the user to visit.
#[tauri::command]
pub async fn get_twitch_auth_url(
    scopes: Vec<String>,
    secrets: State<'_, Secrets>,
) -> Result<AuthUrlResponse, CommandError> {
    let secrets = secrets.inner().clone();

    // Load credentials
    let client_id = secrets.get(SECRET_TWITCH_CLIENT_ID).map_err(|e| match e {
        SecretsError::NotFound(_) => CommandError {
            message: "Twitch Client ID is not configured".to_string(),
        },
        e => e.into(),
    })?;

    let client_secret = secrets
        .get(SECRET_TWITCH_CLIENT_SECRET)
        .map_err(|e| match e {
            SecretsError::NotFound(_) => CommandError {
                message: "Twitch Client Secret is not configured".to_string(),
            },
            e => e.into(),
        })?;

    // Create auth instance
    let redirect_uri =
        Url::parse(crate::auth::DEFAULT_REDIRECT_URI).map_err(|e: url::ParseError| {
            CommandError {
                message: format!("Invalid redirect URI: {}", e),
            }
        })?;

    let client: twitch_api::HelixClient<'static, reqwest::Client> =
        twitch_api::HelixClient::default();
    let auth = crate::auth::TwitchAuth::new(client, client_id, client_secret, redirect_uri);

    // Convert string scopes to Scope enum
    use twitch_api::twitch_oauth2::Scope;
    let parsed_scopes: Vec<Scope> = if scopes.is_empty() {
        default_scopes()
    } else {
        scopes.into_iter().map(Scope::from).collect()
    };

    // Generate authorization URL
    let (auth_url, csrf_token): (Url, String) = auth.generate_auth_url(parsed_scopes).await;

    // Save CSRF token for later verification
    secrets.set(SECRET_TWITCH_CSRF_TOKEN, &csrf_token)?;

    tracing::info!("Generated Twitch authorization URL");

    Ok(AuthUrlResponse {
        url: auth_url.to_string(),
        csrf_token,
    })
}

/// Exchanges the authorization code for tokens and saves them.
#[tauri::command]
pub async fn exchange_twitch_code(
    code: String,
    state: String,
    _scopes: Vec<String>,
    secrets: State<'_, Secrets>,
) -> Result<TokenExchangeResult, CommandError> {
    let secrets = secrets.inner().clone();

    // Load credentials
    let client_id = secrets.get(SECRET_TWITCH_CLIENT_ID).map_err(|e| match e {
        SecretsError::NotFound(_) => CommandError {
            message: "Twitch Client ID is not configured".to_string(),
        },
        e => e.into(),
    })?;

    let client_secret = secrets
        .get(SECRET_TWITCH_CLIENT_SECRET)
        .map_err(|e| match e {
            SecretsError::NotFound(_) => CommandError {
                message: "Twitch Client Secret is not configured".to_string(),
            },
            e => e.into(),
        })?;

    // Load the saved CSRF token
    let expected_csrf = secrets.get(SECRET_TWITCH_CSRF_TOKEN).map_err(|e| match e {
        SecretsError::NotFound(_) => CommandError {
            message: "No pending authorization found. Please generate a new auth link.".to_string(),
        },
        e => e.into(),
    })?;

    // Create auth instance
    let redirect_uri =
        Url::parse(crate::auth::DEFAULT_REDIRECT_URI).map_err(|e: url::ParseError| {
            CommandError {
                message: format!("Invalid redirect URI: {}", e),
            }
        })?;

    let client: twitch_api::HelixClient<'static, reqwest::Client> =
        twitch_api::HelixClient::default();
    let auth = crate::auth::TwitchAuth::new(client, client_id, client_secret, redirect_uri);

    // Exchange code for token with verified CSRF
    let token = auth
        .exchange_code_with_verified_csrf(&code, &state, &expected_csrf)
        .await
        .map_err(|e| {
            tracing::warn!("Failed to exchange authorization code: {}", e);
            CommandError {
                message: format!("Failed to exchange authorization code: {}", e),
            }
        })?;

    // Clear the CSRF token since it's been used
    let _ = secrets.delete(SECRET_TWITCH_CSRF_TOKEN);

    // Save token to secrets
    save_token_to_secrets(secrets.as_ref(), &token).map_err(|e| CommandError {
        message: format!("Failed to save tokens: {}", e),
    })?;

    let username = token.login.to_string();
    tracing::info!("Twitch authorization successful for user: {}", username);

    Ok(TokenExchangeResult {
        success: true,
        message: format!("Successfully authorized as {}", username),
        username: Some(username),
    })
}

/// Validates stored tokens and returns user info.
#[tauri::command]
pub async fn validate_twitch_token(
    secrets: State<'_, Secrets>,
) -> Result<TokenExchangeResult, CommandError> {
    let secrets = secrets.inner().clone();

    // Load credentials
    let client_id = secrets.get(SECRET_TWITCH_CLIENT_ID).map_err(|e| match e {
        SecretsError::NotFound(_) => CommandError {
            message: "Twitch Client ID is not configured".to_string(),
        },
        e => e.into(),
    })?;

    let client_secret = secrets
        .get(SECRET_TWITCH_CLIENT_SECRET)
        .map_err(|e| match e {
            SecretsError::NotFound(_) => CommandError {
                message: "Twitch Client Secret is not configured".to_string(),
            },
            e => e.into(),
        })?;

    // Load stored tokens
    let (access_token, refresh_token) =
        load_token_from_secrets(secrets.as_ref()).map_err(|e| match e {
            SecretsError::NotFound(_) => CommandError {
                message: "No stored tokens found. Please authorize with Twitch.".to_string(),
            },
            e => CommandError {
                message: format!("Failed to load tokens: {}", e),
            },
        })?;

    // Create auth instance
    let redirect_uri =
        Url::parse(crate::auth::DEFAULT_REDIRECT_URI).map_err(|e: url::ParseError| {
            CommandError {
                message: format!("Invalid redirect URI: {}", e),
            }
        })?;

    let client: twitch_api::HelixClient<'static, reqwest::Client> =
        twitch_api::HelixClient::default();
    let auth = crate::auth::TwitchAuth::new(client, client_id, client_secret, redirect_uri);

    // Load and validate token (will auto-refresh if expired)
    let token = auth
        .load_from_tokens(access_token, refresh_token)
        .await
        .map_err(|e| {
            tracing::warn!("Token validation failed: {}", e);
            CommandError {
                message: format!("Token validation failed: {}. Please re-authorize.", e),
            }
        })?;

    // Save potentially refreshed token
    save_token_to_secrets(secrets.as_ref(), &token).map_err(|e| CommandError {
        message: format!("Failed to save refreshed tokens: {}", e),
    })?;

    let username = token.login.to_string();

    // Log at most once per minute per user to avoid duplicate logs when multiple callers validate.
    let should_log = {
        static LAST_VALIDATION_LOG: OnceLock<Mutex<Option<(String, Instant)>>> = OnceLock::new();
        let mut guard = LAST_VALIDATION_LOG
            .get_or_init(|| Mutex::new(None))
            .lock()
            .unwrap();
        let now = Instant::now();
        let throttle = Duration::from_secs(60);
        let should = guard.as_ref().map_or(true, |(u, t)| {
            u != &username || now.saturating_duration_since(*t) > throttle
        });
        if should {
            *guard = Some((username.clone(), now));
        }
        should
    };
    if should_log {
        tracing::debug!("Twitch token validated for user: {}", username);
    }

    Ok(TokenExchangeResult {
        success: true,
        message: format!("Token valid for user {}", username),
        username: Some(username),
    })
}

/// Clears stored Twitch tokens (logout).
#[tauri::command]
pub async fn logout_twitch(secrets: State<'_, Secrets>) -> Result<(), CommandError> {
    let secrets = secrets.inner().clone();
    clear_tokens_from_secrets(secrets.as_ref())?;
    tracing::info!("Twitch tokens cleared");
    Ok(())
}

/// Tests Twitch credentials by validating existing tokens or checking credentials.
#[tauri::command]
pub async fn test_twitch_credentials(
    secrets: State<'_, Secrets>,
) -> Result<TestResult, CommandError> {
    let secrets = secrets.inner().clone();

    // First check if we have stored tokens
    if let Ok((access_token, refresh_token)) = load_token_from_secrets(secrets.as_ref()) {
        // Try to validate existing tokens
        let client_id = secrets.get(SECRET_TWITCH_CLIENT_ID)?;
        let client_secret = secrets.get(SECRET_TWITCH_CLIENT_SECRET)?;

        let redirect_uri =
            Url::parse(crate::auth::DEFAULT_REDIRECT_URI).map_err(|e: url::ParseError| {
                CommandError {
                    message: format!("Invalid redirect URI: {}", e),
                }
            })?;

        let client: twitch_api::HelixClient<'static, reqwest::Client> =
            twitch_api::HelixClient::default();
        let auth = crate::auth::TwitchAuth::new(client, client_id, client_secret, redirect_uri);

        match auth.load_from_tokens(access_token, refresh_token).await {
            Ok(token) => {
                // Save potentially refreshed token
                let _ = save_token_to_secrets(secrets.as_ref(), &token);

                tracing::info!("Twitch credentials validated successfully");
                return Ok(TestResult {
                    success: true,
                    message: format!(
                        "Successfully authenticated as {} with scopes: {:?}",
                        token.login,
                        token.scopes()
                    ),
                });
            }
            Err(e) => {
                tracing::warn!("Token validation failed: {}", e);
                // Fall through to check credentials
            }
        }
    }

    // Check if credentials are configured
    let has_client_id = secrets.get(SECRET_TWITCH_CLIENT_ID).is_ok();
    let has_client_secret = secrets.get(SECRET_TWITCH_CLIENT_SECRET).is_ok();

    if !has_client_id {
        return Ok(TestResult {
            success: false,
            message: "Twitch Client ID is not configured".to_string(),
        });
    }

    if !has_client_secret {
        return Ok(TestResult {
            success: false,
            message: "Twitch Client Secret is not configured".to_string(),
        });
    }

    // Credentials are configured but no valid tokens
    Ok(TestResult {
        success: false,
        message: "Credentials configured. Please complete authorization with Twitch.".to_string(),
    })
}

/// Saves selected scopes to secrets for future use.
#[tauri::command]
pub async fn save_twitch_scopes(
    scopes: Vec<String>,
    secrets: State<'_, Secrets>,
) -> Result<(), CommandError> {
    let secrets = secrets.inner().clone();

    // Join scopes with a delimiter
    let scopes_str = scopes.join(",");
    secrets.set(SECRET_TWITCH_SCOPES, &scopes_str)?;

    tracing::debug!("Saved {} scopes to secrets", scopes.len());
    Ok(())
}

/// Gets previously saved scopes from secrets.
#[tauri::command]
pub async fn get_twitch_scopes(secrets: State<'_, Secrets>) -> Result<Vec<String>, CommandError> {
    let secrets = secrets.inner().clone();

    match secrets.get(SECRET_TWITCH_SCOPES) {
        Ok(scopes_str) => {
            let scopes: Vec<String> = scopes_str
                .split(',')
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect();
            Ok(scopes)
        }
        Err(SecretsError::NotFound(_)) => {
            // Return default scopes if none saved
            Ok(default_scopes()
                .into_iter()
                .map(|s| s.to_string())
                .collect())
        }
        Err(e) => Err(e.into()),
    }
}
