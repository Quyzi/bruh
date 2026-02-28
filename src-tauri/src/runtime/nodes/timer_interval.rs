//! Event source node: Timer that fires every N seconds.

use serde_json::Value;

const MIN_PERIOD_SECONDS: u32 = 1;
const MAX_PERIOD_SECONDS: u32 = 86400;
const DEFAULT_PERIOD_SECONDS: u32 = 60;

/// Event source node that fires once every period_seconds.
#[derive(Debug, Clone)]
pub struct TimerInterval {
    /// Node id from the graph.
    pub id: i32,
    /// Period in seconds (clamped to [MIN_PERIOD_SECONDS, MAX_PERIOD_SECONDS]).
    pub period_seconds: u32,
}

/// Returns period_seconds from a node Value (properties.periodSeconds or widgets_values[0]).
/// Clamps to MIN_PERIOD_SECONDS..=MAX_PERIOD_SECONDS; returns DEFAULT_PERIOD_SECONDS if missing or invalid.
pub(crate) fn period_seconds_from_node(node: &Value) -> u32 {
    let from_str = node
        .get("properties")
        .and_then(|p| p.get("periodSeconds").and_then(|v| v.as_str()))
        .or_else(|| {
            node.get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
        })
        .and_then(|s| {
            let s = s.trim();
            if s.is_empty() {
                None
            } else {
                s.parse::<u32>().ok()
            }
        });
    let from_number = node
        .get("properties")
        .and_then(|p| p.get("periodSeconds"))
        .or_else(|| {
            node.get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.first())
        })
        .and_then(|v| {
            v.as_u64().and_then(|n| u32::try_from(n).ok()).or_else(|| {
                v.as_i64()
                    .and_then(|n| if n >= 0 { u32::try_from(n).ok() } else { None })
            })
        });
    let value = from_str.or(from_number).unwrap_or(DEFAULT_PERIOD_SECONDS);
    value.clamp(MIN_PERIOD_SECONDS, MAX_PERIOD_SECONDS)
}

/// Tries to parse a workflow node Value into TimerInterval.
/// Returns None if the node type is not "utilities/Timer" or parsing fails.
pub fn try_parse(node: &Value) -> Option<TimerInterval> {
    let type_str = node.get("type")?.as_str()?;
    if type_str != "utilities/Timer" {
        return None;
    }
    let id = node.get("id")?.as_i64()? as i32;
    let period_seconds = period_seconds_from_node(node);
    Some(TimerInterval { id, period_seconds })
}
