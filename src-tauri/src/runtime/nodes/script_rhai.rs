//! Transformer node: run a Rhai script with inputs and output.

use std::collections::HashMap;

use anyhow;
use serde_json::Value;

use crate::config::Config;
use crate::metrics;
use crate::scripts::commands::execute_script_impl;
use crate::setup::CommandError;

/// Transformer node that runs a Rhai script and produces an output.
#[derive(Debug, Clone)]
pub struct ScriptRhai {
    /// Node id from the graph.
    pub id: i32,
    /// Script name from properties.scriptName or widgets_values.
    pub script_name: String,
}

/// Tries to parse a workflow node Value into ScriptRhai.
/// Returns None if the node type is not "script/rhai" or parsing fails.
pub fn try_parse(node: &Value) -> Option<ScriptRhai> {
    let type_str = node.get("type")?.as_str()?;
    if type_str != "script/rhai" {
        return None;
    }
    let id = node.get("id")?.as_i64()? as i32;
    let script_name = node
        .get("properties")
        .and_then(|p| p.get("scriptName").and_then(|v| v.as_str()))
        .or_else(|| {
            node.get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
        })
        .unwrap_or("")
        .to_string();
    Some(ScriptRhai { id, script_name })
}

/// Runs a script/rhai node: builds input from slots, runs the script, maps outputs to slots.
/// `node_label` and `node_groups` are used in logs (e.g. Rhai print output) when provided (pipeline execution).
pub fn execute(
    node_value: &Value,
    inputs: HashMap<i32, Value>,
    config: &Config,
    node_label: Option<&str>,
    node_groups: Option<&str>,
) -> Result<Vec<(i32, Value)>, anyhow::Error> {
    let script_name = node_value
        .get("properties")
        .and_then(|p| p.get("scriptName").and_then(|v| v.as_str()))
        .or_else(|| {
            node_value
                .get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
        })
        .unwrap_or("");
    if script_name.is_empty() {
        let label = node_label.unwrap_or("script/rhai");
        tracing::warn!(node = %label, "ScriptRhai node has no scriptName, skip");
        return Ok(Vec::new());
    }
    let script_input = build_script_input(&inputs);
    let label = node_label.unwrap_or(script_name);
    tracing::debug!(script_name, node = %label, groups = ?node_groups, "Executing Rhai script");
    metrics::record_script_execution(script_name);
    let t0 = std::time::Instant::now();
    let result = execute_script_impl(
        script_name,
        Some(script_input),
        config,
        node_label,
        node_groups,
    )
    .map_err(|e: CommandError| {
        metrics::record_script_error(script_name);
        anyhow::anyhow!("{}", e.message)
    })?;
    metrics::record_script_execution_duration(script_name, t0.elapsed().as_millis() as f64);
    let outputs = parse_script_outputs(result.clone());
    if let Some(obj) = result.as_object() {
        let keys: Vec<&str> = obj.keys().map(String::as_str).collect();
        tracing::debug!(script_name, node = %label, groups = ?node_groups, ?keys, "Rhai script returned object");
        if let Some((_, v)) = outputs.get(1) {
            tracing::debug!(script_name, node = %label, groups = ?node_groups, output2_is_null = v.is_null(), "parsed output2");
        }
    }
    Ok(outputs)
}

fn build_script_input(inputs: &HashMap<i32, Value>) -> Value {
    let mut obj = serde_json::Map::new();
    for i in 0..5 {
        let key = format!("input{}", i + 1);
        let value = inputs.get(&i).cloned().unwrap_or(Value::Null);
        obj.insert(key, value);
    }
    Value::Object(obj)
}

/// Parses output slot number from a key like "output1", "Output2", "output_2" (1..=5).
fn output_slot_from_key(key: &str) -> Option<u32> {
    let lower = key.to_lowercase();
    let rest = lower.strip_prefix("output")?;
    let rest = rest.trim_start_matches('_');
    let n: u32 = rest.parse().ok()?;
    if (1..=5).contains(&n) {
        Some(n)
    } else {
        None
    }
}

/// Maps script result to five (slot_index, value). Handles object with output1..output5 or array of 5.
fn parse_script_outputs(result: Value) -> Vec<(i32, Value)> {
    let mut outputs = Vec::with_capacity(5);
    if let Some(arr) = result.as_array() {
        for (i, v) in arr.iter().take(5).enumerate() {
            outputs.push((i as i32, v.clone()));
        }
        while outputs.len() < 5 {
            outputs.push((outputs.len() as i32, Value::Null));
        }
        return outputs;
    }
    if let Some(obj) = result.as_object() {
        let obj_to_scan: &serde_json::Map<String, Value> = if obj.len() == 1 {
            obj.values()
                .next()
                .and_then(Value::as_object)
                .unwrap_or(obj)
        } else {
            obj
        };
        let mut slot_values: [Value; 5] = [
            Value::Null,
            Value::Null,
            Value::Null,
            Value::Null,
            Value::Null,
        ];
        for (key, value) in obj_to_scan.iter() {
            if let Some(slot_1based) = output_slot_from_key(key) {
                let idx = (slot_1based - 1) as usize;
                slot_values[idx] = value.clone();
            }
        }
        for (i, value) in slot_values.iter().cloned().enumerate() {
            outputs.push((i as i32, value));
        }
        return outputs;
    }
    outputs.push((0, result));
    for i in 1..5 {
        outputs.push((i, Value::Null));
    }
    outputs
}
