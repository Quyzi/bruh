//! Generic event source node: follow, subscribe, subscription gift (identified by node type).

use serde_json::Value;

/// Node type strings that are event sources with no extra config (only eventType in properties).
const GENERIC_EVENT_SOURCE_TYPES: &[&str] = &[
    "twitch/chat_message",
    "twitch/channel/follow",
    "twitch/subscription/subscribe",
    "twitch/subscription/gift",
];

/// Generic event source node (e.g. channel follow, subscribe, gift). Recognized by node type.
#[derive(Debug, Clone)]
pub struct GenericEventSource {
    /// Node id from the graph.
    pub id: i32,
}

/// Tries to parse a workflow node Value into GenericEventSource.
/// Returns None if the node type is not one of the known generic event source types.
pub fn try_parse(node: &Value) -> Option<GenericEventSource> {
    let type_str = node.get("type")?.as_str()?;
    if !GENERIC_EVENT_SOURCE_TYPES.contains(&type_str) {
        return None;
    }
    let id = node.get("id")?.as_i64()? as i32;
    Some(GenericEventSource { id })
}
