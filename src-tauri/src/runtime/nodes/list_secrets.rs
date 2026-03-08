//! Transformer node: list all secret names.

use anyhow;
use serde_json::Value;

use crate::secrets::SecretsProvider;
use crate::Secrets;

/// Transformer node that lists all secret names and outputs them as a JSON array.
#[derive(Debug, Clone)]
pub struct ListSecrets {
    /// Node id from the graph.
    pub id: i32,
}

/// Tries to parse a workflow node Value into ListSecrets.
/// Returns None if the node type is not "secrets/list" or parsing fails.
pub fn try_parse(node: &Value) -> Option<ListSecrets> {
    let type_str = node.get("type")?.as_str()?;
    if type_str != "secrets/list" {
        return None;
    }
    let id = node.get("id")?.as_i64()? as i32;
    Some(ListSecrets { id })
}

/// Runs a secrets/list node: lists all secret names and outputs them on slot 0.
pub fn execute(
    _node_value: &Value,
    secrets: &Secrets,
    node_groups: Option<&str>,
) -> Result<Vec<(i32, Value)>, anyhow::Error> {
    let names = secrets.list().map_err(|e| anyhow::anyhow!("{}", e))?;
    tracing::debug!(count = names.len(), groups = ?node_groups, "List Secrets executed");
    let json = serde_json::to_string(&names).unwrap_or_else(|_| "[]".to_string());
    Ok(vec![(0, Value::String(json))])
}
