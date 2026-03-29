//! Result action node: send a formatted template message to a specific Twitch channel.
//! Use ?1–?4 in the template; they are replaced by input slots 1–4 respectively.
//! Input slot 0 is the channel.

use std::collections::HashMap;

use anyhow;
use serde_json::Value;
use twitch_api::twitch_oauth2::TwitchToken;

use crate::auth::{AuthError, ReqwestTwitchAuth};
use crate::metrics;

/// Tries to parse a workflow node Value into a TwitchSendChatFormatted marker.
pub fn try_parse(node: &Value) -> Option<super::TwitchSendChatFormatted> {
    let type_str = node.get("type")?.as_str()?;
    if type_str != "twitch/send_chat_formatted" {
        return None;
    }
    let id = node.get("id")?.as_i64()? as i32;
    Some(super::TwitchSendChatFormatted { id })
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

/// Replaces `?1`–`?4` in the template with the corresponding input slot values (slots 1–4).
fn apply_template(template: &str, inputs: &HashMap<i32, Value>) -> String {
    let mut result = template.to_string();
    for i in 1i32..=4 {
        let placeholder = format!("?{}", i);
        let replacement = value_to_string(inputs.get(&i));
        result = result.replace(&placeholder, &replacement);
    }
    result
}

/// Runs a twitch/send_chat_formatted node.
/// Slot 0 = channel, slots 1–4 = template params ?1–?4.
/// Template is read from `properties.template` (or `widgets_values[0]`).
pub async fn execute(
    node_value: &Value,
    inputs: HashMap<i32, Value>,
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
        tracing::warn!("TwitchSendChatFormatted: template is empty, skip");
        return Ok(Vec::new());
    }

    let message = apply_template(template, &inputs);
    let message = message.trim().to_string();
    if message.is_empty() {
        tracing::warn!("TwitchSendChatFormatted: rendered message is empty, skip");
        return Ok(Vec::new());
    }

    let channel = value_to_string(inputs.get(&0));

    let auth = match authenticator {
        Some(a) => a,
        None => {
            tracing::warn!("TwitchSendChatFormatted: no authenticator, skip");
            return Ok(Vec::new());
        }
    };
    let token = match auth.get_token().await {
        Ok(t) => t,
        Err(e) => {
            if matches!(e, AuthError::NotAuthorized) {
                tracing::debug!(
                    "TwitchSendChatFormatted: no token yet (user must authorize first), skip"
                );
            } else {
                tracing::warn!("TwitchSendChatFormatted: get_token failed: {}", e);
            }
            return Ok(Vec::new());
        }
    };
    let sender_id: twitch_api::types::UserId = match token.user_id() {
        Some(id) => id.to_owned(),
        None => {
            tracing::warn!("TwitchSendChatFormatted: token has no user_id");
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
                tracing::warn!("TwitchSendChatFormatted: get_users failed: {}", e);
                return Ok(Vec::new());
            }
        };
        match response.data.into_iter().next() {
            Some(u) => u.id,
            None => {
                tracing::warn!(
                    "TwitchSendChatFormatted: channel '{}' not found",
                    channel
                );
                return Ok(Vec::new());
            }
        }
    };

    let channel_for_metrics: String =
        if !channel.is_empty() && !channel.chars().all(|c| c.is_ascii_digit()) {
            channel.clone()
        } else {
            use twitch_api::helix::users::get_users;
            let helix = auth.helix_client();
            let request =
                get_users::GetUsersRequest::ids(std::slice::from_ref(&broadcaster_id));
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
    let helix = auth.helix_client();
    let chunks = super::split_message(&message, 450, 500);
    tracing::debug!(
        channel = %channel,
        message_len = message.len(),
        chunks = chunks.len(),
        "Sending formatted Twitch chat message"
    );
    for chunk in &chunks {
        let body = send_chat_message::SendChatMessageBody::new(
            broadcaster_id.clone(),
            sender_id.clone(),
            chunk.clone(),
        );
        let request = send_chat_message::SendChatMessageRequest::new();
        if let Err(e) = helix.req_post(request, body, &token).await {
            tracing::warn!(
                "TwitchSendChatFormatted: send_chat_message failed: {}",
                e
            );
            return Err(anyhow::anyhow!("send_chat_message: {}", e));
        }
        metrics::record_chat_message_sent(&channel_for_metrics);
    }
    tracing::info!(
        channel = %channel_for_metrics,
        chunks = chunks.len(),
        "Formatted Twitch chat message sent"
    );
    Ok(Vec::new())
}
