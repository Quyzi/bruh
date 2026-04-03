//! Pipeline executor: consumes PipelineEvents, routes them, and runs matched pipelines.

use std::collections::{HashMap, HashSet, VecDeque};

use serde_json::Value;

use crate::auth::ReqwestTwitchAuth;
use crate::config::Config;
use crate::metrics;
use crate::Database;
use crate::Secrets;

use super::events::PipelineEvent;
use super::parse::SourcePath;
use super::pipeline;
use super::Pipeline;

/// Slot store: (node_id, slot_index) -> value. Used to pass outputs between nodes.
type SlotStore = HashMap<(i32, i32), Value>;

/// Reverse link index for a pipeline: (target_id, target_slot) -> (origin_id, origin_slot).
type ReverseLinkIndex = HashMap<(i32, i32), (i32, i32)>;

/// Returns a display label for a node for use in logs: title if set, else type, else "id:X".
fn node_display_label(node_value: &Value, node_id: i32) -> String {
    node_value
        .get("title")
        .and_then(|v| v.as_str())
        .map(String::from)
        .unwrap_or_else(|| {
            node_value
                .get("type")
                .and_then(|v| v.as_str())
                .map(String::from)
                .unwrap_or_else(|| format!("id:{}", node_id))
        })
}

/// Finds a node by id in the graph; returns (display label, groups string for logging).
fn node_label_and_groups_from_graph(graph: &Value, node_id: i32) -> (String, String) {
    let nodes = match graph.get("nodes").and_then(|n| n.as_array()) {
        Some(arr) => arr,
        None => return (format!("id:{}", node_id), String::new()),
    };
    let node_value = nodes
        .iter()
        .find(|n| n.get("id").and_then(|v| v.as_i64()) == Some(node_id as i64));
    match node_value {
        Some(n) => (
            node_display_label(n, node_id),
            node_groups_from_graph(graph, n),
        ),
        None => (format!("id:{}", node_id), String::new()),
    }
}

/// Returns the group name (title) the node belongs to for logging, e.g. `!quote` or `Still Alive`.
/// LiteGraph does not serialize group_id on nodes; groups only have title and bounding box.
/// We determine membership by checking if the node's position is inside a group's bounding box.
fn node_groups_from_graph(graph: &Value, node_value: &Value) -> String {
    let (node_x, node_y) = match (
        node_value.get("pos").and_then(|p| p.as_array()),
        node_value.get("size").and_then(|s| s.as_array()),
    ) {
        (Some(pos), Some(size)) if pos.len() >= 2 && size.len() >= 2 => {
            let x = pos[0].as_f64().unwrap_or(0.0);
            let y = pos[1].as_f64().unwrap_or(0.0);
            let w = size[0].as_f64().unwrap_or(0.0);
            let h = size[1].as_f64().unwrap_or(0.0);
            (x + w / 2.0, y + h / 2.0)
        }
        (Some(pos), _) if pos.len() >= 2 => (
            pos[0].as_f64().unwrap_or(0.0),
            pos[1].as_f64().unwrap_or(0.0),
        ),
        _ => return String::new(),
    };
    let groups = match graph.get("groups").and_then(|g| g.as_array()) {
        Some(arr) => arr,
        None => return String::new(),
    };
    for g in groups.iter() {
        let b = match g.get("bounding").and_then(|b| b.as_array()) {
            Some(a) if a.len() >= 4 => a,
            _ => continue,
        };
        let gx = b[0].as_f64().unwrap_or(0.0);
        let gy = b[1].as_f64().unwrap_or(0.0);
        let gw = b[2].as_f64().unwrap_or(0.0);
        let gh = b[3].as_f64().unwrap_or(0.0);
        let inside = node_x >= gx && node_x <= gx + gw && node_y >= gy && node_y <= gy + gh;
        if inside {
            let title = g
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            return title;
        }
    }
    String::new()
}

/// Runs the pipeline executor loop: receive events, route, run each matched pipeline.
pub async fn executor_loop(
    workflow: std::sync::Arc<tokio::sync::RwLock<Value>>,
    pipeline: Pipeline,
    config: Config,
    authenticator: Option<std::sync::Arc<ReqwestTwitchAuth>>,
    database: Option<Database>,
    secrets: Secrets,
    mut receiver: tokio::sync::broadcast::Receiver<PipelineEvent>,
) {
    tracing::info!("Pipeline executor loop started");
    loop {
        match receiver.recv().await {
            Ok(event) => {
                tracing::trace!(
                    subscription_type = %event.subscription_type,
                    "Pipeline executor received event"
                );
                let graph = match workflow.read().await.clone() {
                    g if g
                        .get("nodes")
                        .and_then(|n| n.as_array())
                        .map_or(true, |a| a.is_empty()) =>
                    {
                        tracing::trace!("Workflow graph has no nodes, skipping event");
                        continue;
                    }
                    g => g,
                };
                let matched_paths = pipeline.route(&event, &graph);
                if matched_paths.is_empty() {
                    tracing::trace!(
                        subscription_type = %event.subscription_type,
                        "Router returned no matching paths"
                    );
                } else {
                    let path_info: Vec<String> = matched_paths
                        .iter()
                        .map(|p| {
                            let (label, groups) =
                                node_label_and_groups_from_graph(&graph, p.source_id);
                            if groups.is_empty() {
                                label
                            } else {
                                format!("{} [{}]", label, groups)
                            }
                        })
                        .collect();
                    tracing::debug!(
                        subscription_type = %event.subscription_type,
                        path_count = matched_paths.len(),
                        nodes = ?path_info,
                        "Router returned matched paths"
                    );
                }
                for path in matched_paths {
                    if let Err(error) = run_pipeline(
                        &path,
                        &event,
                        &graph,
                        &config,
                        authenticator.as_ref(),
                        database.as_ref(),
                        &secrets,
                    )
                    .await
                    {
                        let (source_label, source_groups) =
                            node_label_and_groups_from_graph(&graph, path.source_id);
                        metrics::record_pipeline_run_failed(
                            Some(path.source_id),
                            Some(&source_label),
                        );
                        tracing::warn!(
                            source_id = path.source_id,
                            node = %source_label,
                            groups = %source_groups,
                            error = %error,
                            "Pipeline run failed"
                        );
                    }
                }
            }
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                metrics::record_pipeline_events_dropped(n as u64);
                tracing::warn!(dropped = n, "Pipeline executor lagged, dropped events");
            }
            Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                tracing::info!("Pipeline executor channel closed, exiting loop");
                break;
            }
        }
    }
    tracing::debug!("Pipeline executor loop ended");
}

/// Runs one pipeline: inject source outputs, topological sort, execute each node.
async fn run_pipeline(
    path: &SourcePath,
    event: &PipelineEvent,
    graph: &Value,
    config: &Config,
    authenticator: Option<&std::sync::Arc<ReqwestTwitchAuth>>,
    database: Option<&Database>,
    secrets: &Secrets,
) -> Result<(), anyhow::Error> {
    let channel = pipeline::channel_for_event(&event.subscription_type, &event.payload)
        .unwrap_or_default();
    let (source_label, source_groups) = node_label_and_groups_from_graph(graph, path.source_id);
    tracing::debug!(source_id = path.source_id, node = %source_label, groups = %source_groups, "run_pipeline start");
    let mut slot_values = SlotStore::new();
    let node_ids: HashSet<i32> = std::iter::once(path.source_id)
        .chain(path.downstream_ids.iter().copied())
        .collect();

    inject_event_into_slots(
        path.source_id,
        event,
        &mut slot_values,
        Some(&source_label),
        Some(&source_groups),
    );
    tracing::trace!(
        source_id = path.source_id,
        node = %source_label,
        groups = %source_groups,
        slots_filled = slot_values.len(),
        "Source outputs injected"
    );

    let reverse_index = build_reverse_link_index(&node_ids, graph);
    tracing::trace!(
        index_entries = reverse_index.len(),
        "Reverse link index built"
    );

    let order = topological_sort(path.source_id, &path.downstream_ids, graph, &node_ids);
    tracing::debug!(
        source_id = path.source_id,
        node = %source_label,
        groups = %source_groups,
        order_len = order.len(),
        order = ?order,
        "Topological order computed"
    );
    if order.is_empty() {
        tracing::trace!(source_id = path.source_id, node = %source_label, groups = %source_groups, "Empty execution order, skip pipeline");
        return Ok(());
    }

    let nodes_array = match graph.get("nodes").and_then(|n| n.as_array()) {
        Some(arr) => arr,
        None => {
            tracing::trace!("No nodes array in graph");
            return Ok(());
        }
    };

    for &node_id in &order {
        if node_id == path.source_id {
            tracing::trace!(node_id, node = %source_label, groups = %source_groups, "Skip source node (outputs already injected)");
            continue;
        }
        let node_value = nodes_array
            .iter()
            .find(|n| n.get("id").and_then(|v| v.as_i64()) == Some(node_id as i64));
        let node_value = match node_value {
            Some(n) => n,
            None => {
                tracing::trace!(node_id, "Node not found in graph, skip");
                continue;
            }
        };
        let node_label = node_display_label(node_value, node_id);
        let node_type = node_value
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let node_groups = node_groups_from_graph(graph, node_value);
        let inputs = resolve_inputs(node_id, node_value, &reverse_index, &slot_values);
        tracing::trace!(node_id, node = %node_label, groups = %node_groups, input_count = inputs.len(), "Resolved inputs");
        metrics::record_node_execution(node_id, &node_label, node_type, &node_groups, &channel);
        let t0 = std::time::Instant::now();
        match execute_node(
            node_value,
            inputs,
            config,
            authenticator,
            database,
            secrets,
            Some(&node_label),
            Some(&node_groups),
        )
        .await
        {
            Ok(outputs) => {
                let elapsed = t0.elapsed().as_millis() as f64;
                metrics::record_node_execution_duration(node_id, &node_label, node_type, &node_groups, &channel, elapsed);
                metrics::record_node_outcome(
                    node_id,
                    &node_label,
                    node_type,
                    &node_groups,
                    &channel,
                    "success",
                );
                let output_count = outputs.len();
                for (slot_index, value) in outputs {
                    slot_values.insert((node_id, slot_index), value);
                }
                tracing::debug!(node_id, node = %node_label, groups = %node_groups, output_count, elapsed_ms = elapsed * 1000.0, "Node executed");
            }
            Err(error) => {
                let elapsed = t0.elapsed().as_millis() as f64;
                metrics::record_node_execution_duration(node_id, &node_label, node_type, &node_groups, &channel, elapsed);
                metrics::record_node_outcome(
                    node_id,
                    &node_label,
                    node_type,
                    &node_groups,
                    &channel,
                    "error",
                );
                tracing::warn!(node_id, node = %node_label, groups = %node_groups, error = %error, "Node execution failed");
                return Err(error.into());
            }
        }
    }
    let nodes_executed = order.iter().filter(|&&id| id != path.source_id).count();
    tracing::debug!(
        source_id = path.source_id,
        node = %source_label,
        groups = %source_groups,
        nodes_executed,
        "run_pipeline done"
    );
    Ok(())
}

/// Builds (target_id, target_slot) -> (origin_id, origin_slot) for links within node_ids.
fn build_reverse_link_index(node_ids: &HashSet<i32>, graph: &Value) -> ReverseLinkIndex {
    let mut index = ReverseLinkIndex::new();
    let links = match graph.get("links").and_then(|l| l.as_array()) {
        Some(arr) => arr,
        None => return index,
    };
    for link in links {
        let arr = match link.as_array() {
            Some(a) => a,
            None => continue,
        };
        if arr.len() < 5 {
            continue;
        }
        let origin_id = match arr[1].as_i64() {
            Some(n) => n as i32,
            None => continue,
        };
        let origin_slot = match arr[2].as_i64() {
            Some(n) => n as i32,
            None => continue,
        };
        let target_id = match arr[3].as_i64() {
            Some(n) => n as i32,
            None => continue,
        };
        let target_slot = match arr[4].as_i64() {
            Some(n) => n as i32,
            None => continue,
        };
        if !node_ids.contains(&origin_id) || !node_ids.contains(&target_id) {
            continue;
        }
        index.insert((target_id, target_slot), (origin_id, origin_slot));
    }
    index
}

/// Returns node ids in topological order (source first, then nodes as dependencies ready).
fn topological_sort(
    _source_id: i32,
    _downstream_ids: &[i32],
    graph: &Value,
    node_ids: &HashSet<i32>,
) -> Vec<i32> {
    let mut in_degree: HashMap<i32, u32> = node_ids.iter().map(|&id| (id, 0)).collect();
    let empty_links: Vec<Value> = Vec::new();
    let links = graph
        .get("links")
        .and_then(|l| l.as_array())
        .unwrap_or(&empty_links);
    for link in links.iter() {
        let arr = match link.as_array() {
            Some(a) if a.len() >= 4 => a,
            _ => continue,
        };
        let origin_id = match arr[1].as_i64() {
            Some(n) => n as i32,
            None => continue,
        };
        let target_id = match arr[3].as_i64() {
            Some(n) => n as i32,
            None => continue,
        };
        if node_ids.contains(&origin_id) && node_ids.contains(&target_id) && origin_id != target_id
        {
            if let Some(d) = in_degree.get_mut(&target_id) {
                *d += 1;
            }
        }
    }
    let mut order = Vec::new();
    let mut queue: VecDeque<i32> = in_degree
        .iter()
        .filter(|(_, &d)| d == 0)
        .map(|(&id, _)| id)
        .collect();
    while let Some(node_id) = queue.pop_front() {
        order.push(node_id);
        for link in links.iter() {
            let arr = match link.as_array() {
                Some(a) if a.len() >= 4 => a,
                _ => continue,
            };
            let origin_id = match arr[1].as_i64() {
                Some(n) => n as i32,
                None => continue,
            };
            let target_id = match arr[3].as_i64() {
                Some(n) => n as i32,
                None => continue,
            };
            if origin_id != node_id || !node_ids.contains(&target_id) {
                continue;
            }
            if let Some(d) = in_degree.get_mut(&target_id) {
                *d = d.saturating_sub(1);
                if *d == 0 {
                    queue.push_back(target_id);
                }
            }
        }
    }
    order
}

/// Injects event payload into source output slots by subscription type.
/// `source_label` and `source_groups` are used in trace logs when provided.
fn inject_event_into_slots(
    source_id: i32,
    event: &PipelineEvent,
    slot_values: &mut SlotStore,
    source_label: Option<&str>,
    source_groups: Option<&str>,
) {
    let payload = &event.payload;
    let log_groups = source_groups.filter(|s| !s.is_empty());
    match event.subscription_type.as_str() {
        "channel.chat.message" => {
            let channel =
                get_channel_from_payload(payload).unwrap_or_else(|| Value::String(String::new()));
            let message = get_message_text_from_payload(payload)
                .unwrap_or_else(|| Value::String(String::new()));
            let user =
                get_user_from_payload(payload).unwrap_or_else(|| Value::String(String::new()));
            slot_values.insert((source_id, 0), channel);
            slot_values.insert((source_id, 1), message);
            slot_values.insert((source_id, 2), user);
            if let Some(label) = source_label {
                tracing::trace!(source_id, node = %label, groups = ?log_groups, "Injected channel.chat.message slots 0,1,2");
            } else {
                tracing::trace!(source_id, "Injected channel.chat.message slots 0,1,2");
            }
        }
        "channel.follow" => {
            let channel = get_channel_from_follow_payload(payload)
                .unwrap_or_else(|| Value::String(String::new()));
            let user = get_user_from_follow_payload(payload)
                .unwrap_or_else(|| Value::String(String::new()));
            slot_values.insert((source_id, 0), channel);
            slot_values.insert((source_id, 1), user);
            if let Some(label) = source_label {
                tracing::trace!(source_id, node = %label, groups = ?log_groups, "Injected channel.follow slots 0,1 (channel, user)");
            } else {
                tracing::trace!(
                    source_id,
                    "Injected channel.follow slots 0,1 (channel, user)"
                );
            }
        }
        "channel.subscribe" => {
            let channel = get_channel_from_subscribe_payload(payload)
                .unwrap_or_else(|| Value::String(String::new()));
            let user = get_user_from_subscribe_payload(payload)
                .unwrap_or_else(|| Value::String(String::new()));
            let tier = get_tier_from_subscribe_payload(payload)
                .unwrap_or_else(|| Value::String(String::new()));
            let gift = get_gift_from_subscribe_payload(payload).unwrap_or(Value::Bool(false));
            slot_values.insert((source_id, 0), channel);
            slot_values.insert((source_id, 1), user);
            slot_values.insert((source_id, 2), tier);
            slot_values.insert((source_id, 3), gift);
            if let Some(label) = source_label {
                tracing::trace!(source_id, node = %label, groups = ?log_groups, "Injected channel.subscribe slots 0,1,2,3");
            } else {
                tracing::trace!(source_id, "Injected channel.subscribe slots 0,1,2,3");
            }
        }
        "channel.subscription.gift" => {
            let channel = get_channel_from_gift_payload(payload)
                .unwrap_or_else(|| Value::String(String::new()));
            let user =
                get_user_from_gift_payload(payload).unwrap_or_else(|| Value::String(String::new()));
            let tier =
                get_tier_from_gift_payload(payload).unwrap_or_else(|| Value::String(String::new()));
            let total = match get_total_from_gift_payload(payload) {
                Some(value) => value,
                None => match serde_json::Number::from_f64(0.0) {
                    Some(number) => Value::Number(number),
                    None => Value::Null,
                },
            };
            slot_values.insert((source_id, 0), channel);
            slot_values.insert((source_id, 1), user);
            slot_values.insert((source_id, 2), tier);
            slot_values.insert((source_id, 3), total);
            if let Some(label) = source_label {
                tracing::trace!(source_id, node = %label, groups = ?log_groups, "Injected channel.subscription.gift slots 0,1,2,3");
            } else {
                tracing::trace!(
                    source_id,
                    "Injected channel.subscription.gift slots 0,1,2,3"
                );
            }
        }
        "timer/tick" => {
            let period_seconds = payload
                .get("period_seconds")
                .and_then(|v| {
                    v.as_u64().or_else(|| {
                        v.as_i64()
                            .and_then(|n| if n >= 0 { Some(n as u64) } else { None })
                    })
                })
                .unwrap_or(60);
            let value = Value::String(period_seconds.to_string());
            slot_values.insert((source_id, 0), value);
            if let Some(label) = source_label {
                tracing::trace!(source_id, node = %label, groups = ?log_groups, "Injected timer/tick slot 0 (interval_seconds)");
            } else {
                tracing::trace!(source_id, "Injected timer/tick slot 0 (interval_seconds)");
            }
        }
        _ => {
            // Generic fallback: extract broadcaster (slot 0) and user (slot 1) from any event.
            let channel = get_generic_channel_from_payload(payload)
                .unwrap_or_else(|| Value::String(String::new()));
            let user = get_generic_user_from_payload(payload)
                .unwrap_or_else(|| Value::String(String::new()));
            slot_values.insert((source_id, 0), channel);
            slot_values.insert((source_id, 1), user);
            if let Some(label) = source_label {
                tracing::trace!(
                    subscription_type = %event.subscription_type,
                    node = %label,
                    groups = ?log_groups,
                    "Injected generic event slots 0,1 (channel, user)"
                );
            } else {
                tracing::trace!(
                    subscription_type = %event.subscription_type,
                    "Injected generic event slots 0,1 (channel, user)"
                );
            }
        }
    }
}

fn get_channel_from_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::channel_chat_message_inner(payload).or(Some(payload));
    let inner = inner?;
    let s = inner
        .get("broadcaster_user_id")
        .and_then(|v| v.as_str())
        .or_else(|| inner.get("broadcaster_user_login").and_then(|v| v.as_str()))?;
    Some(Value::String(s.to_string()))
}

fn get_message_text_from_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::channel_chat_message_inner(payload).or(Some(payload));
    let inner = inner?;
    let text = inner
        .get("message")
        .and_then(|m| m.get("text"))
        .and_then(|t| t.as_str())?;
    Some(Value::String(text.to_string()))
}

fn get_user_from_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::channel_chat_message_inner(payload).or(Some(payload));
    let inner = inner?;
    let s = inner
        .get("chatter_user_login")
        .and_then(|v| v.as_str())
        .or_else(|| inner.get("chatter_user_name").and_then(|v| v.as_str()))
        .or_else(|| inner.get("chatter_user_id").and_then(|v| v.as_str()))?;
    Some(Value::String(s.to_string()))
}

fn get_channel_from_follow_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::channel_follow_inner(payload)?;
    let s = inner
        .get("broadcaster_user_login")
        .and_then(|v| v.as_str())
        .or_else(|| inner.get("broadcaster_user_name").and_then(|v| v.as_str()))
        .or_else(|| inner.get("broadcaster_user_id").and_then(|v| v.as_str()))?;
    Some(Value::String(s.to_string()))
}

fn get_user_from_follow_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::channel_follow_inner(payload)?;
    let s = inner
        .get("user_login")
        .and_then(|v| v.as_str())
        .or_else(|| inner.get("user_name").and_then(|v| v.as_str()))
        .or_else(|| inner.get("user_id").and_then(|v| v.as_str()))?;
    Some(Value::String(s.to_string()))
}

fn get_channel_from_subscribe_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::channel_subscribe_inner(payload)?;
    let s = inner
        .get("broadcaster_user_login")
        .and_then(|v| v.as_str())
        .or_else(|| inner.get("broadcaster_user_name").and_then(|v| v.as_str()))
        .or_else(|| inner.get("broadcaster_user_id").and_then(|v| v.as_str()))?;
    Some(Value::String(s.to_string()))
}

fn get_user_from_subscribe_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::channel_subscribe_inner(payload)?;
    let s = inner
        .get("user_login")
        .and_then(|v| v.as_str())
        .or_else(|| inner.get("user_name").and_then(|v| v.as_str()))
        .or_else(|| inner.get("user_id").and_then(|v| v.as_str()))?;
    Some(Value::String(s.to_string()))
}

fn get_tier_from_subscribe_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::channel_subscribe_inner(payload)?;
    let s = inner.get("tier").and_then(|v| v.as_str())?;
    Some(Value::String(s.to_string()))
}

fn get_gift_from_subscribe_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::channel_subscribe_inner(payload)?;
    let b = inner.get("is_gift").and_then(|v| v.as_bool())?;
    Some(Value::Bool(b))
}

fn get_channel_from_gift_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::channel_subscription_gift_inner(payload)?;
    let s = inner
        .get("broadcaster_user_login")
        .and_then(|v| v.as_str())
        .or_else(|| inner.get("broadcaster_user_name").and_then(|v| v.as_str()))
        .or_else(|| inner.get("broadcaster_user_id").and_then(|v| v.as_str()))?;
    Some(Value::String(s.to_string()))
}

fn get_user_from_gift_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::channel_subscription_gift_inner(payload)?;
    let s = inner
        .get("user_login")
        .and_then(|v| v.as_str())
        .or_else(|| inner.get("user_name").and_then(|v| v.as_str()))
        .or_else(|| inner.get("user_id").and_then(|v| v.as_str()));
    Some(Value::String(s.unwrap_or("").to_string()))
}

fn get_tier_from_gift_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::channel_subscription_gift_inner(payload)?;
    let s = inner.get("tier").and_then(|v| v.as_str())?;
    Some(Value::String(s.to_string()))
}

fn get_total_from_gift_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::channel_subscription_gift_inner(payload)?;
    let n = inner.get("total").and_then(|v| v.as_i64())?;
    serde_json::to_value(n).ok()
}

fn get_generic_channel_from_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::generic_inner(payload).or(Some(payload))?;
    let s = inner
        .get("broadcaster_user_login")
        .and_then(|v| v.as_str())
        .or_else(|| inner.get("broadcaster_user_name").and_then(|v| v.as_str()))
        .or_else(|| inner.get("broadcaster_user_id").and_then(|v| v.as_str()))?;
    Some(Value::String(s.to_string()))
}

fn get_generic_user_from_payload(payload: &Value) -> Option<Value> {
    let inner = pipeline::generic_inner(payload).or(Some(payload))?;
    let s = inner
        .get("user_login")
        .and_then(|v| v.as_str())
        .or_else(|| inner.get("user_name").and_then(|v| v.as_str()))
        .or_else(|| inner.get("user_id").and_then(|v| v.as_str()))
        .or_else(|| {
            inner
                .get("from_broadcaster_user_login")
                .and_then(|v| v.as_str())
        })
        .or_else(|| inner.get("chatter_user_login").and_then(|v| v.as_str()));
    Some(Value::String(s.unwrap_or("").to_string()))
}

/// Resolves input slot values for a node from the reverse index and slot store.
fn resolve_inputs(
    node_id: i32,
    _node_value: &Value,
    reverse_index: &ReverseLinkIndex,
    slot_values: &SlotStore,
) -> HashMap<i32, Value> {
    let mut inputs = HashMap::new();
    for slot_index in 0..5 {
        let key = (node_id, slot_index);
        if let Some(&(origin_id, origin_slot)) = reverse_index.get(&key) {
            let value = slot_values
                .get(&(origin_id, origin_slot))
                .cloned()
                .unwrap_or(Value::Null);
            inputs.insert(slot_index, value);
        }
    }
    inputs
}

/// Outputs: list of (slot_index, value). Empty for sinks.
/// `node_label` and `node_groups` are used in logs and passed to script execution when provided.
async fn execute_node(
    node_value: &Value,
    inputs: HashMap<i32, Value>,
    config: &Config,
    authenticator: Option<&std::sync::Arc<ReqwestTwitchAuth>>,
    database: Option<&Database>,
    secrets: &Secrets,
    node_label: Option<&str>,
    node_groups: Option<&str>,
) -> Result<Vec<(i32, Value)>, anyhow::Error> {
    let node_type = node_value
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let label: std::borrow::Cow<str> = match node_label {
        Some(l) => std::borrow::Cow::Borrowed(l),
        None => {
            let node_id = node_value.get("id").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            std::borrow::Cow::Owned(node_display_label(node_value, node_id))
        }
    };
    tracing::trace!(node_type, node = %label, groups = ?node_groups, "execute_node");
    match node_type {
        "primitives/Constant" => super::nodes::execute_constant(node_value),
        "script/rhai" => super::nodes::execute_script_rhai(
            node_value,
            inputs,
            config,
            Some(label.as_ref()),
            node_groups,
        ),
        "twitch/send_chat" => {
            super::nodes::execute_twitch_send_chat(node_value, inputs, authenticator).await
        }
        "twitch/send_chat_formatted" => {
            super::nodes::execute_twitch_send_chat_formatted(node_value, inputs, authenticator)
                .await
        }
        "twitch/broadcast_chat" => {
            super::nodes::execute_twitch_broadcast_chat(node_value, inputs, config, authenticator)
                .await
        }
        "twitch/broadcast_chat_formatted" => {
            super::nodes::execute_twitch_broadcast_chat_formatted(
                node_value,
                inputs,
                config,
                authenticator,
            )
            .await
        }
        "database/query" => {
            super::nodes::execute_database_query(node_value, inputs, database, node_groups).await
        }
        "database/query_dynamic" => {
            super::nodes::execute_database_query_dynamic(node_value, inputs, database, node_groups)
                .await
        }
        "secrets/get" => super::nodes::execute_get_secret(node_value, secrets, node_groups),
        "secrets/set" => super::nodes::execute_set_secret(node_value, inputs, secrets, node_groups),
        "secrets/list" => super::nodes::execute_list_secrets(node_value, secrets, node_groups),
        "secrets/delete" => {
            super::nodes::execute_delete_secret(node_value, inputs, secrets, node_groups)
        }
        "ai/prompt" => {
            super::nodes::execute_ai_prompt(node_value, inputs, secrets, config, node_groups).await
        }
        _ => {
            tracing::debug!(node_type, node = %label, groups = ?node_groups, "Unknown node type, skip execution");
            Ok(Vec::new())
        }
    }
}
