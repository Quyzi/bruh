//! Result action node: send a message to all connected channels.

use std::collections::HashMap;

use anyhow;
use serde_json::Value;
use twitch_api::twitch_oauth2::TwitchToken;

use crate::auth::{AuthError, ReqwestTwitchAuth};
use crate::channels::load_channels_from_path;
use crate::metrics;
use crate::config::expand_tilde;
use crate::Config;

/// Result action node that broadcasts a message to all connected channels.
#[derive(Debug, Clone)]
pub struct TwitchBroadcastChat {
    /// Node id from the graph.
    pub id: i32,
}

/// Tries to parse a workflow node Value into TwitchBroadcastChat.
/// Returns None if the node type is not "twitch/broadcast_chat" or parsing fails.
pub fn try_parse(node: &Value) -> Option<TwitchBroadcastChat> {
    let type_str = node.get("type")?.as_str()?;
    if type_str != "twitch/broadcast_chat" {
        return None;
    }
    let id = node.get("id")?.as_i64()? as i32;
    Some(TwitchBroadcastChat { id })
}

fn value_to_message_string(value: Option<&Value>) -> Option<String> {
    let v = value?;
    if v.is_null() {
        return None;
    }
    if let Some(s) = v.as_str() {
        let t = s.trim();
        if t.is_empty() {
            return None;
        }
        return Some(s.to_string());
    }
    if v.is_number() || v.as_bool().is_some() {
        return Some(v.to_string());
    }
    None
}

/// Runs a twitch/broadcast_chat node: sends the message from input slot 0 to every connected channel.
pub async fn execute(
    _node_value: &Value,
    inputs: HashMap<i32, Value>,
    config: &Config,
    authenticator: Option<&std::sync::Arc<ReqwestTwitchAuth>>,
) -> Result<Vec<(i32, Value)>, anyhow::Error> {
    let message = match value_to_message_string(inputs.get(&0)) {
        Some(m) => m,
        None => {
            tracing::warn!("TwitchBroadcastChat: message input missing or empty");
            return Err(anyhow::anyhow!(
                "Broadcast Chat requires a non-empty message on input slot 0 (e.g. from a script output)"
            ));
        }
    };
    let auth = match authenticator {
        Some(a) => a,
        None => {
            tracing::warn!("TwitchBroadcastChat: no authenticator, skip");
            return Ok(Vec::new());
        }
    };
    let token = match auth.get_token().await {
        Ok(t) => t,
        Err(e) => {
            if matches!(e, AuthError::NotAuthorized) {
                tracing::debug!(
                    "TwitchBroadcastChat: no token yet (user must authorize first), skip"
                );
            } else {
                tracing::warn!("TwitchBroadcastChat: get_token failed: {}", e);
            }
            return Ok(Vec::new());
        }
    };
    let sender_id: twitch_api::types::UserId = match token.user_id() {
        Some(id) => id.to_owned(),
        None => {
            tracing::warn!("TwitchBroadcastChat: token has no user_id");
            return Ok(Vec::new());
        }
    };
    let channels_path = expand_tilde(&config.channels);
    let channels = load_channels_from_path(&channels_path);
    if channels.is_empty() {
        tracing::debug!("TwitchBroadcastChat: no channels configured, skip");
        return Ok(Vec::new());
    }
    use twitch_api::helix::chat::send_chat_message;
    use twitch_api::helix::users::get_users;
    let helix = auth.helix_client();
    for ch in &channels {
        let login = ch.login.as_str();
        let logins = [login];
        let request = get_users::GetUsersRequest::logins(&logins);
        let response = match helix.req_get(request, &token).await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!(channel = %login, "TwitchBroadcastChat: get_users failed: {}", e);
                continue;
            }
        };
        let broadcaster_id = match response.data.into_iter().next() {
            Some(u) => u.id,
            None => {
                tracing::warn!(channel = %login, "TwitchBroadcastChat: channel not found");
                continue;
            }
        };
        let body = send_chat_message::SendChatMessageBody::new(
            broadcaster_id.clone(),
            sender_id.clone(),
            message.clone(),
        );
        let request = send_chat_message::SendChatMessageRequest::new();
        if let Err(e) = helix.req_post(request, body, &token).await {
            tracing::warn!(channel = %login, "TwitchBroadcastChat: send_chat_message failed: {}", e);
            continue;
        }
        metrics::record_chat_message_sent(login);
        tracing::info!(channel = %login, "Twitch broadcast chat message sent");
    }
    Ok(Vec::new())
}
