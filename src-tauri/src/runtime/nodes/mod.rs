//! Typed workflow node definitions: one struct per node type, parse from JSON.

mod database_query;
mod generic_event_source;
mod get_secret;
mod script_rhai;
pub mod timer_interval;
mod twitch_broadcast_chat;
mod twitch_chat_message_prefix;
mod twitch_send_chat;

pub use generic_event_source::{try_parse as try_parse_generic_event_source, GenericEventSource};
pub use get_secret::{try_parse as try_parse_get_secret, GetSecret};
pub use script_rhai::{try_parse as try_parse_script_rhai, ScriptRhai};
pub use timer_interval::{try_parse as try_parse_timer_interval, TimerInterval};
pub use twitch_broadcast_chat::{
    try_parse as try_parse_twitch_broadcast_chat, TwitchBroadcastChat,
};
pub use twitch_chat_message_prefix::{
    try_parse as try_parse_twitch_chat_message_prefix, TwitchChatMessagePrefix,
};
pub use twitch_send_chat::{try_parse as try_parse_twitch_send_chat, TwitchSendChat};

/// Re-export execute functions for use by the executor.
pub(crate) use database_query::execute as execute_database_query;
pub(crate) use get_secret::execute as execute_get_secret;
pub(crate) use script_rhai::execute as execute_script_rhai;
pub(crate) use twitch_broadcast_chat::execute as execute_twitch_broadcast_chat;
pub(crate) use twitch_send_chat::execute as execute_twitch_send_chat;

use serde_json::Value;

/// Role of a node in the workflow: event source, transformer, or result action.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeRole {
    /// Produces events (e.g. twitch/chat_message_prefix).
    EventSource,
    /// Transforms data (e.g. script/rhai).
    Transformer,
    /// Consumes data and performs an action (e.g. twitch/send_chat).
    ResultAction,
    /// Unknown type; not used for execution.
    Unknown,
}

/// Returns the role for a given node type string.
#[allow(dead_code)]
pub fn role_for_type(type_str: &str) -> NodeRole {
    match type_str {
        "twitch/chat_message_prefix" => NodeRole::EventSource,
        "twitch/channel/follow" => NodeRole::EventSource,
        "twitch/subscription/subscribe" => NodeRole::EventSource,
        "twitch/subscription/gift" => NodeRole::EventSource,
        "utilities/Timer" => NodeRole::EventSource,
        "script/rhai" => NodeRole::Transformer,
        "secrets/get" => NodeRole::Transformer,
        "twitch/send_chat" => NodeRole::ResultAction,
        "twitch/broadcast_chat" => NodeRole::ResultAction,
        _ => NodeRole::Unknown,
    }
}

/// A typed workflow node: one variant per known node type.
#[derive(Debug, Clone)]
pub enum TypedNode {
    TwitchChatMessagePrefix(TwitchChatMessagePrefix),
    GenericEventSource(GenericEventSource),
    TimerInterval(TimerInterval),
    TwitchBroadcastChat(TwitchBroadcastChat),
    TwitchSendChat(TwitchSendChat),
    ScriptRhai(ScriptRhai),
    GetSecret(GetSecret),
}

impl TypedNode {
    /// Role of this node.
    pub fn role(&self) -> NodeRole {
        match self {
            TypedNode::TwitchChatMessagePrefix(_) => NodeRole::EventSource,
            TypedNode::GenericEventSource(_) => NodeRole::EventSource,
            TypedNode::TimerInterval(_) => NodeRole::EventSource,
            TypedNode::TwitchBroadcastChat(_) => NodeRole::ResultAction,
            TypedNode::TwitchSendChat(_) => NodeRole::ResultAction,
            TypedNode::ScriptRhai(_) => NodeRole::Transformer,
            TypedNode::GetSecret(_) => NodeRole::Transformer,
        }
    }

    /// Node id (all node structs have id).
    pub fn id(&self) -> i32 {
        match self {
            TypedNode::TwitchChatMessagePrefix(n) => n.id,
            TypedNode::GenericEventSource(n) => n.id,
            TypedNode::TimerInterval(n) => n.id,
            TypedNode::TwitchBroadcastChat(n) => n.id,
            TypedNode::TwitchSendChat(n) => n.id,
            TypedNode::ScriptRhai(n) => n.id,
            TypedNode::GetSecret(n) => n.id,
        }
    }
}

/// Tries to parse a raw node Value into a TypedNode.
/// Returns None if the node type is unknown or parsing fails.
pub fn try_parse_node(node: &Value) -> Option<TypedNode> {
    if let Some(n) = try_parse_twitch_chat_message_prefix(node) {
        return Some(TypedNode::TwitchChatMessagePrefix(n));
    }
    if let Some(n) = try_parse_twitch_send_chat(node) {
        return Some(TypedNode::TwitchSendChat(n));
    }
    if let Some(n) = try_parse_twitch_broadcast_chat(node) {
        return Some(TypedNode::TwitchBroadcastChat(n));
    }
    if let Some(n) = try_parse_script_rhai(node) {
        return Some(TypedNode::ScriptRhai(n));
    }
    if let Some(n) = try_parse_get_secret(node) {
        return Some(TypedNode::GetSecret(n));
    }
    if let Some(n) = try_parse_generic_event_source(node) {
        return Some(TypedNode::GenericEventSource(n));
    }
    if let Some(n) = try_parse_timer_interval(node) {
        return Some(TypedNode::TimerInterval(n));
    }
    None
}
