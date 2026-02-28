//! Transformer node: retrieve a secret value by key.

use anyhow;
use serde_json::Value;

use crate::secrets::{SecretsError, SecretsProvider};
use crate::Secrets;

/// Transformer node that retrieves a secret by name and outputs its value.
#[derive(Debug, Clone)]
pub struct GetSecret {
    /// Node id from the graph.
    pub id: i32,
    /// Secret key (name) from properties.key or widgets_values.
    pub key: String,
}

/// Tries to parse a workflow node Value into GetSecret.
/// Returns None if the node type is not "secrets/get" or parsing fails.
pub fn try_parse(node: &Value) -> Option<GetSecret> {
    let type_str = node.get("type")?.as_str()?;
    if type_str != "secrets/get" {
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
    Some(GetSecret { id, key })
}

/// Runs a secrets/get node: retrieves the secret by key and outputs it on slot 0.
/// `node_groups` is used in logs when provided (pipeline execution).
pub fn execute(
    node_value: &Value,
    secrets: &Secrets,
    node_groups: Option<&str>,
) -> Result<Vec<(i32, Value)>, anyhow::Error> {
    let key = node_value
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
        .trim();
    if key.is_empty() {
        let node_id = node_value.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let label: String = node_value
            .get("title")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| {
                node_value
                    .get("type")
                    .and_then(|v| v.as_str())
                    .map(String::from)
                    .unwrap_or_else(|| format!("id:{}", node_id))
            });
        tracing::warn!(node = %label, groups = ?node_groups, "Get Secret node has no key, skip");
        return Ok(vec![(0, Value::String(String::new()))]);
    }
    match secrets.get(key) {
        Ok(value) => Ok(vec![(0, Value::String(value))]),
        Err(SecretsError::NotFound(name)) => Err(anyhow::anyhow!("secret not found: {}", name)),
        Err(e) => Err(anyhow::anyhow!("{}", e)),
    }
}
