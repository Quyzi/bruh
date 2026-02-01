//! Workflow graph types that mirror litegraph.js serialization format.
//! Used to deserialize the workflow JSON file at runtime.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Serialized form of a single link: [id, origin_id, origin_slot, target_id, target_slot, type].
/// Matches litegraph.js LLink.serialize() output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedLink(
    pub i32,
    pub i32,
    pub i32,
    pub i32,
    pub i32,
    pub String,
);

impl SerializedLink {
    /// Link id.
    pub fn id(&self) -> i32 {
        self.0
    }
    /// Origin node id.
    pub fn origin_id(&self) -> i32 {
        self.1
    }
    /// Origin output slot index.
    pub fn origin_slot(&self) -> i32 {
        self.2
    }
    /// Target node id.
    pub fn target_id(&self) -> i32 {
        self.3
    }
    /// Target input slot index.
    pub fn target_slot(&self) -> i32 {
        self.4
    }
    /// Slot type (e.g. data type or event).
    pub fn link_type(&self) -> &str {
        &self.5
    }
}

/// Serialized form of a litegraph group: title, bounding rect, color, font.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedGroup {
    pub title: String,
    pub bounding: [f64; 4],
    pub color: String,
    pub font: String,
}

/// Top-level workflow graph as produced by litegraph.js graph.serialize().
/// Deserializes from the workflow JSON file; re-serializes to the same shape for graph.configure().
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowGraph {
    pub last_node_id: i32,
    pub last_link_id: i32,
    pub nodes: Vec<Value>,
    pub links: Vec<SerializedLink>,
    pub groups: Vec<SerializedGroup>,
    #[serde(default)]
    pub config: Value,
    pub extra: Option<Value>,
    #[serde(default)]
    pub version: u32,
}
