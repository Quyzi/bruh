//! Result action node: delete a secret by name.

use std::collections::HashMap;

use anyhow;
use serde_json::Value;

use crate::secrets::SecretsProvider;
use crate::Secrets;

/// Result action node that deletes a secret by name.
#[derive(Debug, Clone)]
pub struct DeleteSecret {
    /// Node id from the graph.
    pub id: i32,
    /// Secret key (name) from properties — may be overridden by input slot 0.
    pub key: String,
}

/// Tries to parse a workflow node Value into DeleteSecret.
/// Returns None if the node type is not "secrets/delete" or parsing fails.
pub fn try_parse(node: &Value) -> Option<DeleteSecret> {
    let type_str = node.get("type")?.as_str()?;
    if type_str != "secrets/delete" {
        return None;
    }
    let id = node.get("id")?.as_i64()? as i32;
    let key = node
        .get("properties")
        .and_then(|p| p.get("key").and_then(|v| v.as_str()))
        .or_else(|| {
            node.get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
        })
        .unwrap_or("")
        .to_string();
    Some(DeleteSecret { id, key })
}

/// Runs a secrets/delete node: deletes the secret by key.
/// Input slot 0: key (overrides property widget if connected).
pub fn execute(
    node_value: &Value,
    inputs: HashMap<i32, Value>,
    secrets: &Secrets,
    node_groups: Option<&str>,
) -> Result<Vec<(i32, Value)>, anyhow::Error> {
    let key_owned = inputs
        .get(&0)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            node_value
                .get("properties")
                .and_then(|p| p.get("key").and_then(|v| v.as_str()))
                .or_else(|| {
                    node_value
                        .get("widgets_values")
                        .and_then(|w| w.as_array())
                        .and_then(|a| a.first())
                        .and_then(|v| v.as_str())
                })
                .unwrap_or("")
                .to_string()
        });
    let key = key_owned.trim();
    if key.is_empty() {
        let node_id = node_value.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        tracing::warn!(node_id, groups = ?node_groups, "Delete Secret node has no key, skip");
        return Ok(Vec::new());
    }
    secrets.delete(key).map_err(|e| anyhow::anyhow!("{}", e))?;
    tracing::info!(key = %key, groups = ?node_groups, "Secret deleted");
    Ok(Vec::new())
}
