//! Tauri commands for dashboard chat moderation: delete message, timeout, ban.

use std::sync::Arc;

use tauri::State;

use twitch_api::twitch_oauth2::TwitchToken;

use crate::auth::{create_twitch_auth, AuthError, ReqwestTwitchAuth};
use crate::metrics;
use crate::setup::CommandError;
use crate::Secrets;

/// Resolves broadcaster_id (login or numeric id) to UserId using Helix get_users.
async fn resolve_broadcaster_id(
    auth: &ReqwestTwitchAuth,
    token: &twitch_api::twitch_oauth2::UserToken,
    broadcaster_id: &str,
) -> Result<twitch_api::types::UserId, CommandError> {
    if broadcaster_id.chars().all(|c| c.is_ascii_digit()) {
        return Ok(twitch_api::types::UserId::from(broadcaster_id.to_string()));
    }
    use twitch_api::helix::users::get_users;
    let helix = auth.helix_client();
    let logins = [broadcaster_id];
    let request = get_users::GetUsersRequest::logins(&logins);
    let response = helix
        .req_get(request, token)
        .await
        .map_err(|e| CommandError {
            message: format!("Failed to resolve channel: {}", e),
        })?;
    match response.data.into_iter().next() {
        Some(user) => Ok(user.id),
        None => Err(CommandError {
            message: format!("Channel '{}' not found", broadcaster_id),
        }),
    }
}

/// Deletes a chat message. Requires moderator:manage:chat_messages scope.
#[tauri::command]
pub async fn delete_chat_message(
    secrets: State<'_, Secrets>,
    broadcaster_id: String,
    message_id: String,
) -> Result<(), CommandError> {
    let auth = create_twitch_auth(secrets.as_ref()).map_err(|e: AuthError| CommandError {
        message: e.to_string(),
    })?;
    let auth = Arc::new(auth);
    let token = auth.get_token().await.map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    let moderator_id = token.user_id().ok_or_else(|| CommandError {
        message: "Token has no user id".to_string(),
    })?;
    let broadcaster_id = resolve_broadcaster_id(&auth, &token, &broadcaster_id).await?;
    use twitch_api::helix::moderation::delete_chat_messages;
    let request = delete_chat_messages::DeleteChatMessagesRequest::new(
        broadcaster_id.as_str(),
        moderator_id.as_str(),
    )
    .message_id(message_id.as_str());
    let helix = auth.helix_client();
    helix.req_delete(request, &token).await.map_err(|e| {
        let message = e.to_string();
        CommandError {
            message: if message.contains("403") || message.contains("Forbidden") {
                "Not a moderator or missing scope".to_string()
            } else {
                message
            },
        }
    })?;
    metrics::record_moderation_action("delete_message", broadcaster_id.as_str());
    Ok(())
}

/// Puts a user in timeout (temporary ban). Requires moderator:manage:banned_users scope.
#[tauri::command]
pub async fn timeout_user(
    secrets: State<'_, Secrets>,
    broadcaster_id: String,
    user_id: String,
    duration_seconds: u32,
) -> Result<(), CommandError> {
    let auth = create_twitch_auth(secrets.as_ref()).map_err(|e: AuthError| CommandError {
        message: e.to_string(),
    })?;
    let auth = Arc::new(auth);
    let token = auth.get_token().await.map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    let moderator_id = token.user_id().ok_or_else(|| CommandError {
        message: "Token has no user id".to_string(),
    })?;
    let broadcaster_id = resolve_broadcaster_id(&auth, &token, &broadcaster_id).await?;
    use twitch_api::helix::moderation::ban_user;
    let body = ban_user::BanUserBody::new(
        user_id.as_str(),
        "Timeout from dashboard",
        Some(duration_seconds),
    );
    let request = ban_user::BanUserRequest::new(broadcaster_id.as_str(), moderator_id.as_str());
    let helix = auth.helix_client();
    helix.req_post(request, body, &token).await.map_err(|e| {
        let message = e.to_string();
        CommandError {
            message: if message.contains("403") || message.contains("Forbidden") {
                "Not a moderator or missing scope".to_string()
            } else {
                message
            },
        }
    })?;
    metrics::record_moderation_action("timeout", broadcaster_id.as_str());
    Ok(())
}

/// Bans a user from the channel. Requires moderator:manage:banned_users scope.
#[tauri::command]
pub async fn ban_user(
    secrets: State<'_, Secrets>,
    broadcaster_id: String,
    user_id: String,
    reason: Option<String>,
) -> Result<(), CommandError> {
    let auth = create_twitch_auth(secrets.as_ref()).map_err(|e: AuthError| CommandError {
        message: e.to_string(),
    })?;
    let auth = Arc::new(auth);
    let token = auth.get_token().await.map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    let moderator_id = token.user_id().ok_or_else(|| CommandError {
        message: "Token has no user id".to_string(),
    })?;
    let broadcaster_id = resolve_broadcaster_id(&auth, &token, &broadcaster_id).await?;
    let reason = reason.unwrap_or_else(|| "Banned from dashboard".to_string());
    use twitch_api::helix::moderation::ban_user;
    let body = ban_user::BanUserBody::new(user_id.as_str(), reason.as_str(), None);
    let request = ban_user::BanUserRequest::new(broadcaster_id.as_str(), moderator_id.as_str());
    let helix = auth.helix_client();
    helix.req_post(request, body, &token).await.map_err(|e| {
        let message = e.to_string();
        CommandError {
            message: if message.contains("403") || message.contains("Forbidden") {
                "Not a moderator or missing scope".to_string()
            } else {
                message
            },
        }
    })?;
    metrics::record_moderation_action("ban", broadcaster_id.as_str());
    Ok(())
}
