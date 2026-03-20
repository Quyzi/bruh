//! Generic event source node: any workflow node with a non-empty `eventType` property.

use serde_json::Value;

/// Generic event source node. Any node with a non-empty `eventType` property in its
/// `properties` object is treated as an event source — this is the natural discriminator
/// for all Twitch EventSub trigger nodes.
#[derive(Debug, Clone)]
pub struct GenericEventSource {
    /// Node id from the graph.
    pub id: i32,
}

/// Tries to parse a workflow node Value into GenericEventSource.
/// Returns Some if the node has a non-empty `eventType` property; None otherwise.
pub fn try_parse(node: &Value) -> Option<GenericEventSource> {
    let event_type = node.get("properties")?.get("eventType")?.as_str()?;
    if event_type.is_empty() {
        return None;
    }
    let id = node.get("id")?.as_i64()? as i32;
    Some(GenericEventSource { id })
}
