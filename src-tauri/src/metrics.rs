//! Prometheus metric names and recording helpers.

use metrics::{counter, histogram};

/// Counter: EventSub notifications received, by type and channel.
pub const EVENTSUB_EVENTS_TOTAL: &str = "bruh_eventsub_events_total";
/// Counter: EventSub events dropped (channel full or no receivers), by event type.
pub const EVENTSUB_EVENTS_DROPPED_TOTAL: &str = "bruh_eventsub_events_dropped_total";
/// Counter: EventSub WebSocket reconnections.
pub const EVENTSUB_RECONNECTS_TOTAL: &str = "bruh_eventsub_reconnects_total";
/// Counter: Incoming chat messages received, by channel and user.
pub const CHAT_MESSAGES_RECEIVED_TOTAL: &str = "bruh_chat_messages_received_total";
/// Counter: Node execution attempts, by node id, name, type, group, and channel.
pub const NODE_EXECUTIONS_TOTAL: &str = "bruh_node_executions_total";
/// Counter: Node outcomes, by id, name, type, group, channel, and outcome (success | error).
pub const NODE_OUTCOMES_TOTAL: &str = "bruh_node_outcomes_total";
/// Histogram: Node execution wall-clock duration in milliseconds.
pub const NODE_EXECUTION_DURATION_MS: &str = "bruh_node_execution_duration_ms";
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
/// Counter: AI prompt requests, by agent name and provider.
pub const AI_PROMPT_REQUESTS_TOTAL: &str = "bruh_ai_prompt_requests_total";
/// Counter: AI prompt errors, by agent name and provider.
pub const AI_PROMPT_ERRORS_TOTAL: &str = "bruh_ai_prompt_errors_total";
/// Counter: Database queries executed, by kind (read | write).
pub const DATABASE_QUERIES_TOTAL: &str = "bruh_database_queries_total";
/// Counter: Database query errors, by kind (read | write).
pub const DATABASE_QUERY_ERRORS_TOTAL: &str = "bruh_database_query_errors_total";
/// Counter: Moderation actions taken from the dashboard, by action (delete_message | timeout | ban) and channel.
pub const MODERATION_ACTIONS_TOTAL: &str = "bruh_moderation_actions_total";
/// Counter: Rhai script execution attempts, by script name.
pub const SCRIPT_EXECUTIONS_TOTAL: &str = "bruh_script_executions_total";
/// Counter: Rhai script execution errors, by script name.
pub const SCRIPT_ERRORS_TOTAL: &str = "bruh_script_errors_total";
/// Histogram: Rhai script execution wall-clock duration in milliseconds, by script name.
pub const SCRIPT_EXECUTION_DURATION_MS: &str = "bruh_script_execution_duration_ms";

/// Records one EventSub notification with type and channel labels.
pub fn record_eventsub_event(event_type: &str, channel: &str) {
    counter!(EVENTSUB_EVENTS_TOTAL, "type" => event_type.to_string(), "channel" => channel.to_string()).increment(1);
}

/// Records an EventSub event dropped (send failed), by event type.
pub fn record_eventsub_event_dropped(event_type: &str) {
    counter!(EVENTSUB_EVENTS_DROPPED_TOTAL, "type" => event_type.to_string()).increment(1);
}

/// Records one node execution attempt.
pub fn record_node_execution(id: i32, name: &str, node_type: &str, group: &str, channel: &str) {
    counter!(
        NODE_EXECUTIONS_TOTAL,
        "id" => id.to_string(),
        "name" => name.to_string(),
        "node_type" => node_type.to_string(),
        "group" => group.to_string(),
        "channel" => channel.to_string()
    )
    .increment(1);
}

/// Records node outcome (success or error).
pub fn record_node_outcome(id: i32, name: &str, node_type: &str, group: &str, channel: &str, outcome: &str) {
    counter!(
        NODE_OUTCOMES_TOTAL,
        "id" => id.to_string(),
        "name" => name.to_string(),
        "node_type" => node_type.to_string(),
        "group" => group.to_string(),
        "channel" => channel.to_string(),
        "outcome" => outcome.to_string()
    )
    .increment(1);
}

/// Records node execution duration in milliseconds.
pub fn record_node_execution_duration(id: i32, name: &str, node_type: &str, group: &str, channel: &str, duration_ms: f64) {
    histogram!(
        NODE_EXECUTION_DURATION_MS,
        "id" => id.to_string(),
        "name" => name.to_string(),
        "node_type" => node_type.to_string(),
        "group" => group.to_string(),
        "channel" => channel.to_string()
    )
    .record(duration_ms);
}

/// Records one incoming chat message received.
pub fn record_chat_message_received(channel: &str, user: &str) {
    counter!(
        CHAT_MESSAGES_RECEIVED_TOTAL,
        "channel" => channel.to_string(),
        "user" => user.to_string()
    )
    .increment(1);
}

/// Records an EventSub WebSocket reconnect.
pub fn record_eventsub_reconnect() {
    counter!(EVENTSUB_RECONNECTS_TOTAL).increment(1);
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

/// Records one AI prompt request.
pub fn record_ai_prompt_request(agent: &str, provider: &str) {
    counter!(
        AI_PROMPT_REQUESTS_TOTAL,
        "agent" => agent.to_string(),
        "provider" => provider.to_string()
    )
    .increment(1);
}

/// Records one AI prompt error.
pub fn record_ai_prompt_error(agent: &str, provider: &str) {
    counter!(
        AI_PROMPT_ERRORS_TOTAL,
        "agent" => agent.to_string(),
        "provider" => provider.to_string()
    )
    .increment(1);
}

/// Records one database query. `kind` is "read" or "write".
pub fn record_database_query(kind: &str) {
    counter!(DATABASE_QUERIES_TOTAL, "kind" => kind.to_string()).increment(1);
}

/// Records one database query error. `kind` is "read" or "write".
pub fn record_database_query_error(kind: &str) {
    counter!(DATABASE_QUERY_ERRORS_TOTAL, "kind" => kind.to_string()).increment(1);
}

/// Records one moderation action taken from the dashboard.
pub fn record_moderation_action(action: &str, channel: &str) {
    counter!(
        MODERATION_ACTIONS_TOTAL,
        "action" => action.to_string(),
        "channel" => channel.to_string()
    )
    .increment(1);
}

/// Records one Rhai script execution attempt.
pub fn record_script_execution(script_name: &str) {
    counter!(SCRIPT_EXECUTIONS_TOTAL, "script_name" => script_name.to_string()).increment(1);
}

/// Records one Rhai script execution error.
pub fn record_script_error(script_name: &str) {
    counter!(SCRIPT_ERRORS_TOTAL, "script_name" => script_name.to_string()).increment(1);
}

/// Records Rhai script execution duration in milliseconds.
pub fn record_script_execution_duration(script_name: &str, duration_ms: f64) {
    histogram!(
        SCRIPT_EXECUTION_DURATION_MS,
        "script_name" => script_name.to_string()
    )
    .record(duration_ms);
}
