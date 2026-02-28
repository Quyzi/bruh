//! Event source node: Twitch chat message matching a command prefix.

use serde_json::Value;

/// Event source node that emits (channel, message, user) when chat matches a prefix.
#[derive(Debug, Clone)]
pub struct TwitchChatMessagePrefix {
    /// Node id from the graph.
    pub id: i32,
    /// Command prefix (e.g. "!echo", "!quote") from properties or widgets_values.
    pub prefix: String,
}

/// Tries to parse a workflow node Value into TwitchChatMessagePrefix.
/// Returns None if the node type is not "twitch/chat_message_prefix" or parsing fails.
pub fn try_parse(node: &Value) -> Option<TwitchChatMessagePrefix> {
    let type_str = node.get("type")?.as_str()?;
    if type_str != "twitch/chat_message_prefix" {
        return None;
    }
    let id = node.get("id")?.as_i64()? as i32;
    let prefix = node
        .get("properties")
        .and_then(|p| p.get("prefix").and_then(|v| v.as_str()))
        .or_else(|| {
            node.get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
        })
        .unwrap_or("")
        .to_string();
    Some(TwitchChatMessagePrefix { id, prefix })
}
