//! Result action node: send a message to Twitch chat.

use std::collections::HashMap;

use anyhow;
use serde_json::Value;
use twitch_api::twitch_oauth2::TwitchToken;

use crate::auth::{AuthError, ReqwestTwitchAuth};
use crate::metrics;

/// Result action node that sends (channel, message) to Twitch chat.
#[derive(Debug, Clone)]
pub struct TwitchSendChat {
    /// Node id from the graph.
    pub id: i32,
}

/// Tries to parse a workflow node Value into TwitchSendChat.
/// Returns None if the node type is not "twitch/send_chat" or parsing fails.
pub fn try_parse(node: &Value) -> Option<TwitchSendChat> {
    let type_str = node.get("type")?.as_str()?;
    if type_str != "twitch/send_chat" {
        return None;
    }
    let id = node.get("id")?.as_i64()? as i32;
    Some(TwitchSendChat { id })
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

/// Runs a twitch/send_chat node: sends the message from input slot 1 to the channel from slot 0.
pub async fn execute(
    _node_value: &Value,
    inputs: HashMap<i32, Value>,
    authenticator: Option<&std::sync::Arc<ReqwestTwitchAuth>>,
) -> Result<Vec<(i32, Value)>, anyhow::Error> {
    let channel = inputs
        .get(&0)
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_default();
    let message = match value_to_message_string(inputs.get(&1)) {
        Some(m) => m,
        None => {
            tracing::warn!("TwitchSendChat: message input missing or empty");
            return Err(anyhow::anyhow!(
                "Send Chat requires a non-empty message on input slot 1 (e.g. from a script output)"
            ));
        }
    };
    let auth = match authenticator {
        Some(a) => a,
        None => {
            tracing::warn!("TwitchSendChat: no authenticator, skip");
            return Ok(Vec::new());
        }
    };
    let token = match auth.get_token().await {
        Ok(t) => t,
        Err(e) => {
            if matches!(e, AuthError::NotAuthorized) {
                tracing::debug!("TwitchSendChat: no token yet (user must authorize first), skip");
            } else {
                tracing::warn!("TwitchSendChat: get_token failed: {}", e);
            }
            return Ok(Vec::new());
        }
    };
    let sender_id: twitch_api::types::UserId = match token.user_id() {
        Some(id) => id.to_owned(),
        None => {
            tracing::warn!("TwitchSendChat: token has no user_id");
            return Ok(Vec::new());
        }
    };
    let broadcaster_id: twitch_api::types::UserId = if channel.is_empty() {
        sender_id.clone()
    } else if channel.chars().all(|c| c.is_ascii_digit()) {
        twitch_api::types::UserId::from(channel.clone())
    } else {
        use twitch_api::helix::users::get_users;
        let helix = auth.helix_client();
        let logins = [channel.as_str()];
        let request = get_users::GetUsersRequest::logins(&logins);
        let response = match helix.req_get(request, &token).await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!("TwitchSendChat: get_users failed: {}", e);
                return Ok(Vec::new());
            }
        };
        match response.data.into_iter().next() {
            Some(u) => u.id,
            None => {
                tracing::warn!("TwitchSendChat: channel '{}' not found", channel);
                return Ok(Vec::new());
            }
        }
    };

    let channel_for_metrics: String = if !channel.is_empty() && !channel.chars().all(|c| c.is_ascii_digit()) {
        channel.clone()
    } else {
        use twitch_api::helix::users::get_users;
        let helix = auth.helix_client();
        let request = get_users::GetUsersRequest::ids(std::slice::from_ref(&broadcaster_id));
        match helix.req_get(request, &token).await {
            Ok(response) => response
                .data
                .into_iter()
                .next()
                .map(|u| u.login.to_string())
                .unwrap_or_else(|| channel.clone()),
            Err(_) => channel.clone(),
        }
    };

    use twitch_api::helix::chat::send_chat_message;
    let body =
        send_chat_message::SendChatMessageBody::new(broadcaster_id, sender_id, message.clone());
    let request = send_chat_message::SendChatMessageRequest::new();
    let helix = auth.helix_client();
    tracing::debug!(channel = %channel, message_len = message.len(), "Sending Twitch chat message");
    if let Err(e) = helix.req_post(request, body, &token).await {
        tracing::warn!("TwitchSendChat: send_chat_message failed: {}", e);
        return Err(anyhow::anyhow!("send_chat_message: {}", e));
    }
    metrics::record_chat_message_sent(&channel_for_metrics);
    tracing::info!(channel = %channel_for_metrics, "Twitch chat message sent");
    Ok(Vec::new())
}
