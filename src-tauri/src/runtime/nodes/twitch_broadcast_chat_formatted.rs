//! Result action node: send a formatted template message to all connected channels.
//! Use ?1–?5 in the template; they are replaced by input slots 0–4 respectively.

use std::collections::HashMap;

use anyhow;
use serde_json::Value;
use twitch_api::twitch_oauth2::TwitchToken;

use crate::auth::{AuthError, ReqwestTwitchAuth};
use crate::channels::load_channels_from_path;
use crate::config::expand_tilde;
use crate::metrics;
use crate::Config;

/// Tries to parse a workflow node Value into a TwitchBroadcastChatFormatted marker.
pub fn try_parse(node: &Value) -> Option<super::TwitchBroadcastChatFormatted> {
    let type_str = node.get("type")?.as_str()?;
    if type_str != "twitch/broadcast_chat_formatted" {
        return None;
    }
    let id = node.get("id")?.as_i64()? as i32;
    Some(super::TwitchBroadcastChatFormatted { id })
}

fn value_to_string(value: Option<&Value>) -> String {
    match value {
        Some(v) if v.is_null() => String::new(),
        Some(v) => {
            if let Some(s) = v.as_str() {
                s.to_string()
            } else if v.is_number() || v.as_bool().is_some() {
                v.to_string()
            } else {
                String::new()
            }
        }
        None => String::new(),
    }
}

/// Replaces `?1`–`?5` in the template with the corresponding input slot values (slots 0–4).
fn apply_template(template: &str, inputs: &HashMap<i32, Value>) -> String {
    let mut result = template.to_string();
    for i in 1i32..=5 {
        let placeholder = format!("?{}", i);
        let slot = i - 1;
        let replacement = value_to_string(inputs.get(&slot));
        result = result.replace(&placeholder, &replacement);
    }
    result
}

/// Runs a twitch/broadcast_chat_formatted node.
/// Slots 0–4 map to template params ?1–?5.
/// Template is read from `properties.template` (or `widgets_values[0]`).
pub async fn execute(
    node_value: &Value,
    inputs: HashMap<i32, Value>,
    config: &Config,
    authenticator: Option<&std::sync::Arc<ReqwestTwitchAuth>>,
) -> Result<Vec<(i32, Value)>, anyhow::Error> {
    let template = node_value
        .get("properties")
        .and_then(|p| p.get("template").and_then(|v| v.as_str()))
        .or_else(|| {
            node_value
                .get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
        })
        .unwrap_or("");

    if template.trim().is_empty() {
        tracing::warn!("TwitchBroadcastChatFormatted: template is empty, skip");
        return Ok(Vec::new());
    }

    let message = apply_template(template, &inputs);
    let message = message.trim().to_string();
    if message.is_empty() {
        tracing::warn!("TwitchBroadcastChatFormatted: rendered message is empty, skip");
        return Ok(Vec::new());
    }

    let auth = match authenticator {
        Some(a) => a,
        None => {
            tracing::warn!("TwitchBroadcastChatFormatted: no authenticator, skip");
            return Ok(Vec::new());
        }
    };
    let token = match auth.get_token().await {
        Ok(t) => t,
        Err(e) => {
            if matches!(e, AuthError::NotAuthorized) {
                tracing::debug!(
                    "TwitchBroadcastChatFormatted: no token yet (user must authorize first), skip"
                );
            } else {
                tracing::warn!("TwitchBroadcastChatFormatted: get_token failed: {}", e);
            }
            return Ok(Vec::new());
        }
    };
    let sender_id: twitch_api::types::UserId = match token.user_id() {
        Some(id) => id.to_owned(),
        None => {
            tracing::warn!("TwitchBroadcastChatFormatted: token has no user_id");
            return Ok(Vec::new());
        }
    };
    let channels_path = expand_tilde(&config.channels);
    let channels = load_channels_from_path(&channels_path);
    if channels.is_empty() {
        tracing::debug!("TwitchBroadcastChatFormatted: no channels configured, skip");
        return Ok(Vec::new());
    }
    use twitch_api::helix::chat::send_chat_message;
    use twitch_api::helix::users::get_users;
    let helix = auth.helix_client();
    let chunks = super::split_message(&message, 450, 500);
    'channels: for ch in &channels {
        let login = ch.login.as_str();
        let logins = [login];
        let request = get_users::GetUsersRequest::logins(&logins);
        let response = match helix.req_get(request, &token).await {
            Ok(r) => r,
            Err(e) => {
                tracing::warn!(
                    channel = %login,
                    "TwitchBroadcastChatFormatted: get_users failed: {}",
                    e
                );
                continue;
            }
        };
        let broadcaster_id = match response.data.into_iter().next() {
            Some(u) => u.id,
            None => {
                tracing::warn!(
                    channel = %login,
                    "TwitchBroadcastChatFormatted: channel not found"
                );
                continue;
            }
        };
        for chunk in &chunks {
            let body = send_chat_message::SendChatMessageBody::new(
                broadcaster_id.clone(),
                sender_id.clone(),
                chunk.clone(),
            );
            let request = send_chat_message::SendChatMessageRequest::new();
            if let Err(e) = helix.req_post(request, body, &token).await {
                tracing::warn!(
                    channel = %login,
                    "TwitchBroadcastChatFormatted: send_chat_message failed: {}",
                    e
                );
                continue 'channels;
            }
            metrics::record_chat_message_sent(login);
        }
        tracing::info!(
            channel = %login,
            chunks = chunks.len(),
            "Formatted Twitch broadcast chat message sent"
        );
    }
    Ok(Vec::new())
}
