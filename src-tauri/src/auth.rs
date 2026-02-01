use std::sync::Arc;

use thiserror::Error;
use tokio::sync::RwLock;
use twitch_api::{
    twitch_oauth2::{AppAccessToken, ClientId, ClientSecret, TwitchToken},
    HelixClient,
};

use crate::secrets::{SecretsError, SecretsProvider};

pub const SECRET_TWITCH_CLIENT_ID: &str = "twitch_client_id";
pub const SECRET_TWITCH_CLIENT_SECRET: &str = "twitch_client_secret";

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("missing credential: {0}")]
    MissingCredential(String),

    #[error("secrets error: {0}")]
    Secrets(#[from] SecretsError),

    #[error("failed to obtain access token: {0}")]
    TokenRequest(String),

    #[error("token has expired and refresh failed: {0}")]
    TokenRefresh(String),
}

/// Manages Twitch authentication using the client credentials grant flow.
///
/// This provides app access tokens suitable for server-to-server API calls
/// that don't require user authorization.
pub struct TwitchAuth<C: twitch_api::HttpClient + 'static> {
    client: HelixClient<'static, C>,
    client_id: ClientId,
    client_secret: ClientSecret,
    token: RwLock<Option<AppAccessToken>>,
}

impl<C> TwitchAuth<C>
where
    C: twitch_api::HttpClient + 'static,
{
    /// Creates a new TwitchAuth by loading credentials from the secrets provider.
    pub fn from_secrets<S: SecretsProvider>(
        secrets: &S,
        client: HelixClient<'static, C>,
    ) -> Result<Self, AuthError> {
        let client_id = secrets.get(SECRET_TWITCH_CLIENT_ID).map_err(|e| match e {
            SecretsError::NotFound(_) => {
                AuthError::MissingCredential(SECRET_TWITCH_CLIENT_ID.to_string())
            }
            other => AuthError::Secrets(other),
        })?;

        let client_secret = secrets
            .get(SECRET_TWITCH_CLIENT_SECRET)
            .map_err(|e| match e {
                SecretsError::NotFound(_) => {
                    AuthError::MissingCredential(SECRET_TWITCH_CLIENT_SECRET.to_string())
                }
                other => AuthError::Secrets(other),
            })?;

        Ok(Self {
            client,
            client_id: ClientId::new(client_id),
            client_secret: ClientSecret::new(client_secret),
            token: RwLock::new(None),
        })
    }

    /// Creates a new TwitchAuth with explicit credentials.
    pub fn new(client: HelixClient<'static, C>, client_id: String, client_secret: String) -> Self {
        Self {
            client,
            client_id: ClientId::new(client_id),
            client_secret: ClientSecret::new(client_secret),
            token: RwLock::new(None),
        }
    }

    /// Returns a reference to the underlying Helix client.
    pub fn helix_client(&self) -> &HelixClient<'static, C> {
        &self.client
    }

    /// Returns the client ID.
    pub fn client_id(&self) -> &ClientId {
        &self.client_id
    }

    /// Obtains a fresh app access token using client credentials.
    async fn fetch_token(&self) -> Result<AppAccessToken, AuthError> {
        AppAccessToken::get_app_access_token(
            &self.client,
            self.client_id.clone(),
            self.client_secret.clone(),
            vec![],
        )
        .await
        .map_err(|e| AuthError::TokenRequest(e.to_string()))
    }

    /// Returns a valid access token, fetching or refreshing as needed.
    ///
    /// This method handles token lifecycle automatically:
    /// - Fetches a new token if none exists
    /// - Returns the cached token if it's still valid
    /// - Fetches a new token if the cached one has expired
    pub async fn get_token(&self) -> Result<AppAccessToken, AuthError> {
        {
            let guard = self.token.read().await;
            if let Some(ref token) = *guard {
                if !token.is_elapsed() {
                    return Ok(token.clone());
                }
            }
        }

        let mut guard = self.token.write().await;

        // Double-check after acquiring write lock
        if let Some(ref token) = *guard {
            if !token.is_elapsed() {
                return Ok(token.clone());
            }
        }

        let new_token = self.fetch_token().await?;
        *guard = Some(new_token.clone());
        Ok(new_token)
    }

    /// Forces a token refresh, discarding any cached token.
    pub async fn refresh_token(&self) -> Result<AppAccessToken, AuthError> {
        let new_token = self.fetch_token().await?;
        let mut guard = self.token.write().await;
        *guard = Some(new_token.clone());
        Ok(new_token)
    }

    /// Invalidates the cached token without fetching a new one.
    pub async fn invalidate_token(&self) {
        let mut guard = self.token.write().await;
        *guard = None;
    }
}

/// Thread-safe shared Twitch authentication handle.
pub type SharedTwitchAuth<C> = Arc<TwitchAuth<C>>;

/// Type alias for the default reqwest-based TwitchAuth.
pub type ReqwestTwitchAuth = TwitchAuth<reqwest::Client>;

/// Creates a new TwitchAuth with a default reqwest client, loading credentials from secrets.
pub fn create_twitch_auth<S: SecretsProvider>(secrets: &S) -> Result<ReqwestTwitchAuth, AuthError> {
    let client: HelixClient<'static, reqwest::Client> = HelixClient::default();
    TwitchAuth::from_secrets(secrets, client)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct MockSecrets {
        client_id: Option<String>,
        client_secret: Option<String>,
    }

    impl SecretsProvider for MockSecrets {
        fn get(&self, name: &str) -> Result<String, SecretsError> {
            match name {
                SECRET_TWITCH_CLIENT_ID => self
                    .client_id
                    .clone()
                    .ok_or_else(|| SecretsError::NotFound(name.to_string())),
                SECRET_TWITCH_CLIENT_SECRET => self
                    .client_secret
                    .clone()
                    .ok_or_else(|| SecretsError::NotFound(name.to_string())),
                _ => Err(SecretsError::NotFound(name.to_string())),
            }
        }

        fn set(&self, _name: &str, _value: &str) -> Result<(), SecretsError> {
            Ok(())
        }

        fn delete(&self, _name: &str) -> Result<Option<String>, SecretsError> {
            Ok(None)
        }

        fn list(&self) -> Result<Vec<String>, SecretsError> {
            Ok(vec![])
        }
    }

    #[test]
    fn missing_client_id_returns_error() {
        let secrets = MockSecrets {
            client_id: None,
            client_secret: Some("secret".to_string()),
        };
        let client: HelixClient<'static, reqwest::Client> = HelixClient::default();

        let result = TwitchAuth::from_secrets(&secrets, client);
        assert!(
            matches!(result, Err(AuthError::MissingCredential(ref s)) if s == SECRET_TWITCH_CLIENT_ID)
        );
    }

    #[test]
    fn missing_client_secret_returns_error() {
        let secrets = MockSecrets {
            client_id: Some("id".to_string()),
            client_secret: None,
        };
        let client: HelixClient<'static, reqwest::Client> = HelixClient::default();

        let result = TwitchAuth::from_secrets(&secrets, client);
        assert!(
            matches!(result, Err(AuthError::MissingCredential(ref s)) if s == SECRET_TWITCH_CLIENT_SECRET)
        );
    }

    #[test]
    fn valid_credentials_creates_auth() {
        let secrets = MockSecrets {
            client_id: Some("test_id".to_string()),
            client_secret: Some("test_secret".to_string()),
        };
        let client: HelixClient<'static, reqwest::Client> = HelixClient::default();

        let result = TwitchAuth::from_secrets(&secrets, client);
        assert!(result.is_ok());

        let auth = result.unwrap();
        assert_eq!(auth.client_id().as_str(), "test_id");
    }
}
