//! Timer loop: periodically finds utilities/Timer nodes in the workflow and sends timer/tick events.
//! Only sends events when the runtime state is Running.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use serde_json::json;
use tokio::sync::broadcast;
use tokio::sync::RwLock;

use crate::metrics;

use super::events::PipelineEvent;
use super::nodes::timer_interval;
use super::RuntimeState;

/// Runs the timer loop: every second, checks runtime state; when Running, reads the workflow,
/// finds utilities/Timer nodes, and for each whose period has elapsed sends a PipelineEvent.
pub async fn run_timer_loop(
    workflow: Arc<RwLock<serde_json::Value>>,
    event_tx: broadcast::Sender<PipelineEvent>,
    state: Arc<RwLock<RuntimeState>>,
) {
    tracing::info!("Timer loop started");
    let mut last_fire: HashMap<i32, Instant> = HashMap::new();
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        interval.tick().await;
        if *state.read().await != RuntimeState::Running {
            continue;
        }
        let graph = match workflow.read().await.clone() {
            g if g
                .get("nodes")
                .and_then(|n| n.as_array())
                .map_or(true, |a| a.is_empty()) =>
            {
                continue;
            }
            g => g,
        };
        let nodes = match graph.get("nodes").and_then(|n| n.as_array()) {
            Some(arr) => arr,
            None => continue,
        };
        let now = Instant::now();
        for node in nodes.iter() {
            let type_str = match node.get("type").and_then(|v| v.as_str()) {
                Some(t) => t,
                None => continue,
            };
            if type_str != "utilities/Timer" {
                continue;
            }
            let id = match node.get("id").and_then(|v| v.as_i64()) {
                Some(n) => n as i32,
                None => continue,
            };
            let period_seconds = timer_interval::period_seconds_from_node(node);
            let period_duration = std::time::Duration::from_secs(period_seconds as u64);
            let should_fire = match last_fire.get(&id) {
                None => true,
                Some(prev) => now.duration_since(*prev) >= period_duration,
            };
            if !should_fire {
                continue;
            }
            let event = PipelineEvent {
                subscription_type: "timer/tick".to_string(),
                payload: json!({
                    "source_id": id,
                    "period_seconds": period_seconds
                }),
            };
            if event_tx.send(event).is_ok() {
                metrics::record_timer_tick_sent(id);
            } else {
                tracing::trace!("Timer event send failed (receiver dropped)");
            }
            last_fire.insert(id, now);
        }
    }
}
