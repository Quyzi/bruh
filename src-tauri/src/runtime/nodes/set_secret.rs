//! Result action node: store a secret value.

use std::collections::HashMap;

use anyhow;
use serde_json::Value;

use crate::secrets::SecretsProvider;
use crate::Secrets;

/// Result action node that sets a secret by name to a given value.
#[derive(Debug, Clone)]
pub struct SetSecret {
    /// Node id from the graph.
    pub id: i32,
    /// Secret key (name) from properties — may be overridden by input slot 0.
    pub key: String,
}

/// Tries to parse a workflow node Value into SetSecret.
/// Returns None if the node type is not "secrets/set" or parsing fails.
pub fn try_parse(node: &Value) -> Option<SetSecret> {
    let type_str = node.get("type")?.as_str()?;
    if type_str != "secrets/set" {
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
    Some(SetSecret { id, key })
}

/// Runs a secrets/set node: writes the secret.
/// Input slot 0: key (overrides property widget if connected).
/// Input slot 1: value (the secret value to store).
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
        tracing::warn!(node_id, groups = ?node_groups, "Set Secret node has no key, skip");
        return Ok(Vec::new());
    }
    let value = inputs
        .get(&1)
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_default();
    secrets
        .set(key, &value)
        .map_err(|e| anyhow::anyhow!("{}", e))?;
    tracing::info!(key = %key, groups = ?node_groups, "Secret set");
    Ok(Vec::new())
}
