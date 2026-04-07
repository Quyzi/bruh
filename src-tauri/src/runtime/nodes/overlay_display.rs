//! Result action node: display an overlay notification.

use std::collections::HashMap;

use serde_json::Value;
use tauri::Emitter;

const MIN_DURATION_MS: u32 = 1000;
const MAX_DURATION_MS: u32 = 30000;
const DEFAULT_DURATION_MS: u32 = 5000;

#[derive(Debug, Clone)]
pub struct OverlayDisplay {
    pub id: i32,
    pub template_name: String,
    pub default_duration_ms: u32,
}

fn duration_ms_from_node(node: &Value) -> u32 {
    let from_str = node
        .get("properties")
        .and_then(|p| p.get("durationMs").and_then(|v| v.as_str()))
        .or_else(|| {
            node.get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.get(1))
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
        .and_then(|p| p.get("durationMs"))
        .or_else(|| {
            node.get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.get(1))
        })
        .and_then(|v| {
            v.as_u64().and_then(|n| u32::try_from(n).ok()).or_else(|| {
                v.as_i64()
                    .and_then(|n| if n >= 0 { u32::try_from(n).ok() } else { None })
            })
        });
    let value = from_str.or(from_number).unwrap_or(DEFAULT_DURATION_MS);
    value.clamp(MIN_DURATION_MS, MAX_DURATION_MS)
}

fn template_name_from_node(node: &Value) -> String {
    node.get("properties")
        .and_then(|p| p.get("templateName").and_then(|v| v.as_str()))
        .or_else(|| {
            node.get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
        })
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "default".to_string())
}

pub fn try_parse(node: &Value) -> Option<OverlayDisplay> {
    let type_str = node.get("type")?.as_str()?;
    if type_str != "overlay/display" {
        return None;
    }
    let id = node.get("id")?.as_i64()? as i32;
    let template_name = template_name_from_node(node);
    let default_duration_ms = duration_ms_from_node(node);
    Some(OverlayDisplay {
        id,
        template_name,
        default_duration_ms,
    })
}

pub async fn execute(
    node_value: &Value,
    inputs: HashMap<i32, Value>,
    app_handle: tauri::AppHandle,
) -> Result<Vec<(i32, Value)>, anyhow::Error> {
    let message = inputs
        .get(&0)
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_default();
    // Input is in seconds (e.g. "5" = 5 s = 5000 ms)
    let duration_ms = inputs
        .get(&1)
        .and_then(|v| {
            let secs = v
                .as_str()
                .and_then(|s| s.trim().parse::<f64>().ok())
                .or_else(|| v.as_f64());
            secs.map(|s| (s * 1000.0).round() as u32)
        })
        .unwrap_or_else(|| duration_ms_from_node(node_value))
        .clamp(MIN_DURATION_MS, MAX_DURATION_MS);

    let template_name = template_name_from_node(node_value);

    let event_data = serde_json::json!({
        "message": message,
        "duration_ms": duration_ms,
        "template_name": template_name,
    });

    tracing::debug!(template = %template_name, duration = duration_ms, "Overlay display triggered");

    let _ = app_handle.emit("overlay-display", event_data);

    Ok(vec![(0, serde_json::json!({"status": "sent"}))])
}
