//! Prometheus metric names and recording helpers.

use metrics::counter;

/// Counter: EventSub notifications received, by type and channel.
pub const EVENTSUB_EVENTS_TOTAL: &str = "bruh_eventsub_events_total";
/// Counter: EventSub events dropped (channel full or no receivers).
pub const EVENTSUB_EVENTS_DROPPED_TOTAL: &str = "bruh_eventsub_events_dropped_total";
/// Counter: Node execution attempts, by node id, name, and type.
pub const NODE_EXECUTIONS_TOTAL: &str = "bruh_node_executions_total";
/// Counter: Node outcomes, by id, name, type, and outcome (success | error).
pub const NODE_OUTCOMES_TOTAL: &str = "bruh_node_outcomes_total";
/// Counter: Chat messages sent, by channel.
pub const CHAT_MESSAGES_SENT_TOTAL: &str = "bruh_chat_messages_sent_total";
/// Counter: Pipeline events dropped due to executor lag.
pub const PIPELINE_EVENTS_DROPPED_TOTAL: &str = "bruh_pipeline_events_dropped_total";
/// Counter: Pipeline runs that failed.
pub const PIPELINE_RUNS_FAILED_TOTAL: &str = "bruh_pipeline_runs_failed_total";
/// Counter: Token refresh failures in EventSub refresher.
pub const AUTH_TOKEN_REFRESH_FAILURES_TOTAL: &str = "bruh_auth_token_refresh_failures_total";
/// Counter: Timer ticks sent, by source_id.
pub const TIMER_TICKS_SENT_TOTAL: &str = "bruh_timer_ticks_sent_total";

/// Records one EventSub notification with type and channel labels.
pub fn record_eventsub_event(event_type: &str, channel: &str) {
    counter!(EVENTSUB_EVENTS_TOTAL, "type" => event_type.to_string(), "channel" => channel.to_string()).increment(1);
}

/// Records an EventSub event dropped (send failed).
pub fn record_eventsub_event_dropped() {
    counter!(EVENTSUB_EVENTS_DROPPED_TOTAL).increment(1);
}

/// Records one node execution attempt.
pub fn record_node_execution(id: i32, name: &str, node_type: &str, group: &str) {
    counter!(
        NODE_EXECUTIONS_TOTAL,
        "id" => id.to_string(),
        "name" => name.to_string(),
        "node_type" => node_type.to_string(),
        "group" => group.to_string()
    )
    .increment(1);
}

/// Records node outcome (success or error).
pub fn record_node_outcome(id: i32, name: &str, node_type: &str, group: &str, outcome: &str) {
    counter!(
        NODE_OUTCOMES_TOTAL,
        "id" => id.to_string(),
        "name" => name.to_string(),
        "node_type" => node_type.to_string(),
        "group" => group.to_string(),
        "outcome" => outcome.to_string()
    )
    .increment(1);
}

/// Records one chat message sent to a channel.
pub fn record_chat_message_sent(channel: &str) {
    counter!(CHAT_MESSAGES_SENT_TOTAL, "channel" => channel.to_string()).increment(1);
}

/// Records pipeline events dropped due to Lagged.
pub fn record_pipeline_events_dropped(count: u64) {
    counter!(PIPELINE_EVENTS_DROPPED_TOTAL).increment(count);
}

/// Records a pipeline run failure (optional source_id and source_name for labels).
pub fn record_pipeline_run_failed(source_id: Option<i32>, source_name: Option<&str>) {
    let id_label = source_id
        .map(|i| i.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let name_label = source_name.unwrap_or("unknown").to_string();
    counter!(
        PIPELINE_RUNS_FAILED_TOTAL,
        "source_id" => id_label,
        "source_name" => name_label
    )
    .increment(1);
}

/// Records a token refresh failure.
pub fn record_auth_token_refresh_failure() {
    counter!(AUTH_TOKEN_REFRESH_FAILURES_TOTAL).increment(1);
}

/// Records a timer tick sent for a source.
pub fn record_timer_tick_sent(source_id: i32) {
    counter!(TIMER_TICKS_SENT_TOTAL, "source_id" => source_id.to_string()).increment(1);
}
