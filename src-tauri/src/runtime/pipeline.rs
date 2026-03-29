//! Pipeline routing: matches EventSub events to workflow source paths.

use serde_json::Value;

use super::events::PipelineEvent;
use super::parse::{parse_workflow, SourcePath};

/// Pipeline router: matches events to workflow source paths (one per event source).
#[derive(Debug, Default)]
pub struct Pipeline;

impl Pipeline {
    /// Returns the source paths (pipelines) that match this event.
    /// Each path is the subgraph rooted at one matching event source.
    pub fn route(&self, event: &PipelineEvent, graph: &Value) -> Vec<SourcePath> {
        if event.subscription_type == "timer/tick" {
            return route_timer_tick(event, graph);
        }
        let structure = parse_workflow(graph);
        let nodes = match graph.get("nodes").and_then(|n| n.as_array()) {
            Some(arr) => arr,
            None => return Vec::new(),
        };

        let mut matched = Vec::new();
        for path in structure.paths {
            let source_node = nodes
                .iter()
                .find(|n| n.get("id").and_then(|v| v.as_i64()) == Some(path.source_id as i64));
            let source_node = match source_node {
                Some(n) => n,
                None => continue,
            };
            let props = match source_node.get("properties") {
                Some(p) => p,
                None => continue,
            };
            let node_event_type = match props.get("eventType").and_then(|v| v.as_str()) {
                Some(t) => t,
                None => continue,
            };
            if node_event_type != event.subscription_type {
                continue;
            }
            if !event_matches_source(event, source_node) {
                continue;
            }
            matched.push(path);
        }
        if event.subscription_type == "channel.chat.message" {
            apply_prefix_specificity(matched, &event.payload, nodes)
        } else {
            matched
        }
    }
}

/// Routes a timer/tick event: match the single path whose source is utilities/Timer with the payload source_id.
fn route_timer_tick(event: &PipelineEvent, graph: &Value) -> Vec<SourcePath> {
    let source_id = match event.payload.get("source_id").and_then(|v| v.as_i64()) {
        Some(id) => id as i32,
        None => return Vec::new(),
    };
    let structure = parse_workflow(graph);
    let nodes = match graph.get("nodes").and_then(|n| n.as_array()) {
        Some(arr) => arr,
        None => return Vec::new(),
    };
    for path in &structure.paths {
        if path.source_id != source_id {
            continue;
        }
        let source_node = nodes
            .iter()
            .find(|n| n.get("id").and_then(|v| v.as_i64()) == Some(path.source_id as i64));
        let source_node = match source_node {
            Some(n) => n,
            None => continue,
        };
        let node_type = source_node
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if node_type == "utilities/Timer" {
            return vec![path.clone()];
        }
    }
    Vec::new()
}

/// Returns true if the event passes event-type-specific filters for this source node.
fn event_matches_source(event: &PipelineEvent, source_node: &Value) -> bool {
    if event.subscription_type == "channel.chat.message" {
        return chat_message_matches_source(&event.payload, source_node);
    }
    true
}

/// For channel.chat.message: if source is twitch/chat_message_prefix, require prefix match.
fn chat_message_matches_source(payload: &Value, source_node: &Value) -> bool {
    let node_type = source_node
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if node_type != "twitch/chat_message_prefix" {
        return true;
    }
    let prefix = get_node_prefix(source_node).unwrap_or("");
    let text = match chat_message_text(payload) {
        Some(t) => t,
        None => return false,
    };
    text.starts_with(prefix)
}

/// Extracts the prefix string from a twitch/chat_message_prefix source node.
fn get_node_prefix<'a>(source_node: &'a Value) -> Option<&'a str> {
    source_node
        .get("properties")
        .and_then(|p| p.get("prefix").and_then(|v| v.as_str()))
        .or_else(|| {
            source_node
                .get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
        })
}

/// For channel.chat.message events, filters matched paths so only the most specific
/// prefix node(s) fire. If two nodes have the same (longest) prefix, both fire.
/// Non-prefix nodes are always included unchanged.
fn apply_prefix_specificity(
    matched: Vec<super::parse::SourcePath>,
    payload: &Value,
    nodes: &[Value],
) -> Vec<super::parse::SourcePath> {
    let mut prefix_paths: Vec<(super::parse::SourcePath, usize)> = Vec::new();
    let mut other_paths: Vec<super::parse::SourcePath> = Vec::new();

    for path in matched {
        let source_node = nodes
            .iter()
            .find(|n| n.get("id").and_then(|v| v.as_i64()) == Some(path.source_id as i64));
        let source_node = match source_node {
            Some(n) => n,
            None => {
                other_paths.push(path);
                continue;
            }
        };
        let node_type = source_node
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if node_type != "twitch/chat_message_prefix" {
            other_paths.push(path);
            continue;
        }
        let prefix_len = get_node_prefix(source_node).map(|p| p.len()).unwrap_or(0);
        prefix_paths.push((path, prefix_len));
    }

    if let Some(max_len) = prefix_paths.iter().map(|(_, len)| *len).max() {
        for (path, len) in prefix_paths {
            if len == max_len {
                other_paths.push(path);
            }
        }
    }

    other_paths
}

/// Returns the inner channel.chat.message event object from the serialized Event payload.
/// Handles twitch_api shape: {"ChannelChatMessageV1": {"subscription", "message": {"Notification": event}}}.
pub(crate) fn channel_chat_message_inner(payload: &Value) -> Option<&Value> {
    let variant = payload.get("ChannelChatMessageV1")?;
    let message_obj = variant.get("message")?;
    message_obj
        .get("Notification")
        .or_else(|| message_obj.as_object().and_then(|o| o.values().next()))
}

/// Extracts the chat message text from a channel.chat.message payload (JSON).
/// Handles twitch_api Event serialization (enum variant wrapper or direct message object).
fn chat_message_text(payload: &Value) -> Option<&str> {
    let inner = channel_chat_message_inner(payload).or(Some(payload));
    let inner = inner?;
    inner
        .get("message")
        .and_then(|m| m.get("text"))
        .and_then(|t| t.as_str())
}

/// Returns the inner channel.follow event object from the serialized Event payload.
pub(crate) fn channel_follow_inner(payload: &Value) -> Option<&Value> {
    let variant = payload.get("ChannelFollowV2")?;
    let message_obj = variant.get("message")?;
    message_obj
        .get("Notification")
        .or_else(|| message_obj.as_object().and_then(|o| o.values().next()))
}

/// Returns the inner channel.subscribe event object from the serialized Event payload.
pub(crate) fn channel_subscribe_inner(payload: &Value) -> Option<&Value> {
    let variant = payload.get("ChannelSubscribeV1")?;
    let message_obj = variant.get("message")?;
    message_obj
        .get("Notification")
        .or_else(|| message_obj.as_object().and_then(|o| o.values().next()))
}

/// Returns the inner channel.subscription.gift event object from the serialized Event payload.
pub(crate) fn channel_subscription_gift_inner(payload: &Value) -> Option<&Value> {
    let variant = payload.get("ChannelSubscriptionGiftV1")?;
    let message_obj = variant.get("message")?;
    message_obj
        .get("Notification")
        .or_else(|| message_obj.as_object().and_then(|o| o.values().next()))
}

/// Extracts the inner event object from any twitch_api serialized Event payload.
/// twitch_api serializes events as `{ "SomeVariantName": { "subscription": ..., "message": { "Notification": event } } }`.
/// This walks: top-level single key → get("message") → get("Notification") (or fallback to message itself).
pub(crate) fn generic_inner(payload: &Value) -> Option<&Value> {
    let obj = payload.as_object()?;
    // If there's a single top-level key, it's the enum variant wrapper.
    if obj.len() == 1 {
        let variant_val = obj.values().next()?;
        let message_obj = variant_val.get("message")?;
        return message_obj
            .get("Notification")
            .or_else(|| message_obj.as_object().and_then(|m| m.values().next()))
            .or(Some(message_obj));
    }
    // Flat payload (no variant wrapper): return as-is.
    Some(payload)
}

/// Returns the channel identifier for metrics (broadcaster login/name/id) when the event type has one.
pub fn channel_for_event(subscription_type: &str, payload: &Value) -> Option<String> {
    let inner = match subscription_type {
        "channel.chat.message" => channel_chat_message_inner(payload).or(Some(payload))?,
        "channel.follow" => channel_follow_inner(payload)?,
        "channel.subscribe" => channel_subscribe_inner(payload)?,
        "channel.subscription.gift" => channel_subscription_gift_inner(payload)?,
        _ => generic_inner(payload).or(Some(payload))?,
    };
    let string_value = inner
        .get("broadcaster_user_login")
        .and_then(|v| v.as_str())
        .or_else(|| inner.get("broadcaster_user_name").and_then(|v| v.as_str()))
        .or_else(|| inner.get("broadcaster_user_id").and_then(|v| v.as_str()))?;
    Some(string_value.to_string())
}
