//! Transformer node: outputs a constant string value.

use serde_json::Value;

/// Transformer node that emits a fixed string on its output slot.
#[derive(Debug, Clone)]
pub struct Constant {
    /// Node id from the graph.
    pub id: i32,
}

/// Tries to parse a workflow node Value into Constant.
/// Returns None if the node type is not "primitives/Constant" or parsing fails.
pub fn try_parse(node: &Value) -> Option<Constant> {
    let type_str = node.get("type")?.as_str()?;
    if type_str != "primitives/Constant" {
        return None;
    }
    let id = node.get("id")?.as_i64()? as i32;
    Some(Constant { id })
}

/// Reads the constant value from properties or widgets_values and emits it on slot 0.
pub fn execute(node_value: &Value) -> Result<Vec<(i32, Value)>, anyhow::Error> {
    let value = node_value
        .get("properties")
        .and_then(|p| p.get("value").and_then(|v| v.as_str()))
        .or_else(|| {
            node_value
                .get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
        })
        .unwrap_or("");
    Ok(vec![(0, Value::String(value.to_string()))])
}
