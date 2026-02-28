//! Pipeline event type and broadcast channel capacity for EventSub notifications.

use serde::Serialize;

/// Bounded capacity for the pipeline event broadcast channel.
pub const PIPELINE_EVENT_CHANNEL_CAPACITY: usize = 64;

/// One EventSub notification for the pipeline: subscription type and payload as JSON.
#[derive(Clone, Debug)]
pub struct PipelineEvent {
    /// EventSub subscription type (e.g. `"channel.chat.message"`).
    pub subscription_type: String,
    /// Payload as JSON (from EventSub notification).
    pub payload: serde_json::Value,
}

/// Payload emitted to the frontend for the Dashboard chat log (one per channel.chat.message).
#[derive(Clone, Debug, Serialize)]
pub struct DashboardChatPayload {
    pub channel: String,
    pub username: String,
    pub message: String,
    pub timestamp: String,
    pub message_id: String,
    pub user_id: String,
    /// Twitch user's chosen name color (hex e.g. "#00FF7F"). Empty if not set.
    pub color: String,
}
