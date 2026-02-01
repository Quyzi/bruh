//! Twitch authentication using the OAuth Authorization Code Grant Flow.
//!
//! This module provides user access tokens suitable for accessing user-specific
//! resources like chat, which require user authorization.

use std::sync::Arc;

use thiserror::Error;
use tokio::sync::RwLock;
use twitch_api::{
    twitch_oauth2::{
        tokens::UserTokenBuilder, AccessToken, ClientId, ClientSecret, CsrfToken, RefreshToken,
        Scope, TwitchToken, UserToken,
    },
    HelixClient,
};
use url::Url;

use crate::secrets::{SecretsError, SecretsProvider};

// Secret keys for credentials
pub const SECRET_TWITCH_CLIENT_ID: &str = "twitch/client_id";
pub const SECRET_TWITCH_CLIENT_SECRET: &str = "twitch/client_secret";

// Secret keys for user tokens
pub const SECRET_TWITCH_ACCESS_TOKEN: &str = "twitch/access_token";
pub const SECRET_TWITCH_REFRESH_TOKEN: &str = "twitch/refresh_token";
pub const SECRET_TWITCH_SCOPES: &str = "twitch/scopes";
pub const SECRET_TWITCH_CSRF_TOKEN: &str = "twitch/csrf_token";

/// Default redirect URI for OAuth callback (uses Tauri's dev server port)
pub const DEFAULT_REDIRECT_URI: &str = "http://localhost:1420/callback";

/// Default scopes required for chat functionality
pub fn default_scopes() -> Vec<Scope> {
    vec![
        Scope::ChatRead,
        Scope::ChatEdit,
        Scope::UserReadChat,
        Scope::UserWriteChat,
    ]
}

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

    #[error("invalid CSRF token")]
    InvalidCsrf,

    #[error("no token available - user must authorize first")]
    NotAuthorized,

    #[error("invalid redirect URI: {0}")]
    InvalidRedirectUri(String),
}

/// State for an in-progress OAuth authorization flow.
pub struct PendingAuth {
    pub builder: UserTokenBuilder,
    pub csrf_token: CsrfToken,
}

impl std::fmt::Debug for PendingAuth {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PendingAuth")
            .field("csrf_token", &self.csrf_token)
            .finish_non_exhaustive()
    }
}

/// Manages Twitch authentication using the OAuth Authorization Code Grant Flow.
///
/// This provides user access tokens suitable for accessing user-specific
/// resources like reading and sending chat messages.
pub struct TwitchAuth<C: twitch_api::HttpClient + 'static> {
    client: HelixClient<'static, C>,
    client_id: ClientId,
    client_secret: ClientSecret,
    redirect_uri: Url,
    token: RwLock<Option<UserToken>>,
    pending_auth: RwLock<Option<PendingAuth>>,
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

        let redirect_uri = Url::parse(DEFAULT_REDIRECT_URI)
            .map_err(|e: url::ParseError| AuthError::InvalidRedirectUri(e.to_string()))?;

        Ok(Self {
            client,
            client_id: ClientId::new(client_id),
            client_secret: ClientSecret::new(client_secret),
            redirect_uri,
            token: RwLock::new(None),
            pending_auth: RwLock::new(None),
        })
    }

    /// Creates a new TwitchAuth with explicit credentials.
    pub fn new(
        client: HelixClient<'static, C>,
        client_id: String,
        client_secret: String,
        redirect_uri: Url,
    ) -> Self {
        Self {
            client,
            client_id: ClientId::new(client_id),
            client_secret: ClientSecret::new(client_secret),
            redirect_uri,
            token: RwLock::new(None),
            pending_auth: RwLock::new(None),
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

    /// Returns the redirect URI.
    pub fn redirect_uri(&self) -> &Url {
        &self.redirect_uri
    }

    /// Generates the authorization URL for the OAuth flow.
    ///
    /// The user should be directed to this URL to authorize the application.
    /// After authorization, they will be redirected to the redirect_uri with
    /// a code and state parameter.
    pub async fn generate_auth_url(&self, scopes: Vec<Scope>) -> (Url, String) {
        let mut builder = UserTokenBuilder::new(
            self.client_id.clone(),
            self.client_secret.clone(),
            self.redirect_uri.clone(),
        );
        builder = builder.set_scopes(scopes);
        builder = builder.force_verify(false);

        let (url, csrf_token) = builder.generate_url();
        let csrf_string = csrf_token.secret().to_string();

        // Store the pending auth state
        let mut pending = self.pending_auth.write().await;
        *pending = Some(PendingAuth {
            builder,
            csrf_token,
        });

        (url, csrf_string)
    }

    /// Exchanges the authorization code for a user token.
    ///
    /// This should be called after the user is redirected back from Twitch
    /// with the authorization code.
    pub async fn exchange_code(&self, code: &str, state: &str) -> Result<UserToken, AuthError> {
        let mut pending_guard = self.pending_auth.write().await;
        let pending = pending_guard.take().ok_or(AuthError::NotAuthorized)?;

        // Validate CSRF token
        if !pending.builder.csrf_is_valid(state) {
            // Restore the pending state since validation failed
            *pending_guard = Some(pending);
            return Err(AuthError::InvalidCsrf);
        }

        drop(pending_guard);

        // Exchange code for token
        let token = pending
            .builder
            .get_user_token(&self.client, state, code)
            .await
            .map_err(|e| AuthError::TokenRequest(e.to_string()))?;

        // Store the token
        let mut token_guard = self.token.write().await;
        *token_guard = Some(token.clone());

        Ok(token)
    }

    /// Exchanges the authorization code for a user token with a pre-verified CSRF token.
    ///
    /// This variant is used when the CSRF token has been stored and verified externally
    /// (e.g., stored in secrets between the auth URL generation and code exchange).
    /// It bypasses the UserTokenBuilder's internal CSRF check by making a direct HTTP request.
    pub async fn exchange_code_with_verified_csrf(
        &self,
        code: &str,
        state: &str,
        expected_csrf: &str,
    ) -> Result<UserToken, AuthError> {
        // Verify CSRF ourselves
        if state != expected_csrf {
            return Err(AuthError::InvalidCsrf);
        }

        // Exchange the code using direct HTTP request to bypass UserTokenBuilder's CSRF check
        let http_client = reqwest::Client::new();
        let params = [
            ("client_id", self.client_id.as_str()),
            ("client_secret", self.client_secret.secret()),
            ("code", code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", self.redirect_uri.as_str()),
        ];

        let response = http_client
            .post("https://id.twitch.tv/oauth2/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| AuthError::TokenRequest(e.to_string()))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(AuthError::TokenRequest(format!(
                "Token request failed: {}",
                error_text
            )));
        }

        #[derive(serde::Deserialize)]
        struct TokenResponse {
            access_token: String,
            refresh_token: String,
            expires_in: u64,
        }

        let token_response: TokenResponse = response
            .json()
            .await
            .map_err(|e| AuthError::TokenRequest(e.to_string()))?;

        // Validate the token to get user info (login, user_id, scopes)
        let access_token = AccessToken::from(token_response.access_token);
        let refresh_token = RefreshToken::from(token_response.refresh_token);

        // Use from_token to validate and get user info
        let validated_token = UserToken::from_token(&http_client, access_token)
            .await
            .map_err(|e| AuthError::TokenRequest(e.to_string()))?;

        // Extract values before moving
        let scopes = validated_token.scopes().to_vec();
        let login = validated_token.login.clone();
        let user_id = validated_token.user_id.clone();

        // Create final token with refresh token and client secret for auto-refresh
        let token = UserToken::from_existing_unchecked(
            validated_token.access_token,
            Some(refresh_token),
            self.client_id.clone(),
            Some(self.client_secret.clone()),
            login,
            user_id,
            Some(scopes),
            Some(std::time::Duration::from_secs(token_response.expires_in)),
        );

        // Store the token
        let mut token_guard = self.token.write().await;
        *token_guard = Some(token.clone());

        Ok(token)
    }

    /// Loads a user token from stored access and refresh tokens.
    ///
    /// This will automatically refresh the token if it has expired.
    pub async fn load_from_tokens(
        &self,
        access_token: String,
        refresh_token: String,
    ) -> Result<UserToken, AuthError> {
        let token = UserToken::from_existing_or_refresh_token(
            &self.client,
            AccessToken::from(access_token),
            RefreshToken::from(refresh_token),
            self.client_id.clone(),
            self.client_secret.clone(),
        )
        .await
        .map_err(|e| AuthError::TokenRequest(e.to_string()))?;

        // Store the token
        let mut token_guard = self.token.write().await;
        *token_guard = Some(token.clone());

        Ok(token)
    }

    /// Returns a valid user token, refreshing if necessary.
    ///
    /// Returns an error if no token is available (user hasn't authorized).
    pub async fn get_token(&self) -> Result<UserToken, AuthError> {
        let mut guard = self.token.write().await;

        match guard.as_mut() {
            Some(token) => {
                // Check if token needs refresh
                if token.is_elapsed() {
                    token
                        .refresh_token(&self.client)
                        .await
                        .map_err(|e| AuthError::TokenRefresh(e.to_string()))?;
                }
                Ok(token.clone())
            }
            None => Err(AuthError::NotAuthorized),
        }
    }

    /// Returns the current token without refreshing.
    ///
    /// Use this when you need to check if a token exists or to save it.
    pub async fn current_token(&self) -> Option<UserToken> {
        self.token.read().await.clone()
    }

    /// Checks if a valid token is available.
    pub async fn is_authorized(&self) -> bool {
        self.token.read().await.is_some()
    }

    /// Manually sets the user token.
    pub async fn set_token(&self, token: UserToken) {
        let mut guard = self.token.write().await;
        *guard = Some(token);
    }

    /// Invalidates the current token.
    pub async fn invalidate_token(&self) {
        let mut guard = self.token.write().await;
        *guard = None;
    }

    /// Revokes the current token with Twitch and clears it locally.
    pub async fn revoke_token(&self) -> Result<(), AuthError> {
        let mut guard = self.token.write().await;
        if let Some(token) = guard.take() {
            token
                .revoke_token(&self.client)
                .await
                .map_err(|e| AuthError::TokenRequest(e.to_string()))?;
        }
        Ok(())
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

/// Saves the user token to the secrets provider.
pub fn save_token_to_secrets<S: SecretsProvider>(
    secrets: &S,
    token: &UserToken,
) -> Result<(), SecretsError> {
    secrets.set(SECRET_TWITCH_ACCESS_TOKEN, token.access_token.secret())?;

    if let Some(ref refresh) = token.refresh_token {
        secrets.set(SECRET_TWITCH_REFRESH_TOKEN, refresh.secret())?;
    }

    Ok(())
}

/// Loads token strings from secrets (for use with load_from_tokens).
pub fn load_token_from_secrets<S: SecretsProvider>(
    secrets: &S,
) -> Result<(String, String), SecretsError> {
    let access = secrets.get(SECRET_TWITCH_ACCESS_TOKEN)?;
    let refresh = secrets.get(SECRET_TWITCH_REFRESH_TOKEN)?;
    Ok((access, refresh))
}

/// Clears stored tokens from secrets.
pub fn clear_tokens_from_secrets<S: SecretsProvider>(secrets: &S) -> Result<(), SecretsError> {
    let _ = secrets.delete(SECRET_TWITCH_ACCESS_TOKEN);
    let _ = secrets.delete(SECRET_TWITCH_REFRESH_TOKEN);
    Ok(())
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
