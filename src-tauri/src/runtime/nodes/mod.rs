//! Typed workflow node definitions: one struct per node type, parse from JSON.

mod ai_prompt;
mod database_query;
mod delete_secret;
mod generic_event_source;
mod get_secret;
mod list_secrets;
mod script_rhai;
mod set_secret;
pub mod timer_interval;
mod twitch_broadcast_chat;
mod twitch_chat_message_prefix;
mod twitch_send_chat;

pub use delete_secret::{try_parse as try_parse_delete_secret, DeleteSecret};
pub use generic_event_source::{try_parse as try_parse_generic_event_source, GenericEventSource};
pub use get_secret::{try_parse as try_parse_get_secret, GetSecret};
pub use list_secrets::{try_parse as try_parse_list_secrets, ListSecrets};
pub use script_rhai::{try_parse as try_parse_script_rhai, ScriptRhai};
pub use set_secret::{try_parse as try_parse_set_secret, SetSecret};
pub use timer_interval::{try_parse as try_parse_timer_interval, TimerInterval};
pub use twitch_broadcast_chat::{
    try_parse as try_parse_twitch_broadcast_chat, TwitchBroadcastChat,
};
pub use twitch_chat_message_prefix::{
    try_parse as try_parse_twitch_chat_message_prefix, TwitchChatMessagePrefix,
};
pub use twitch_send_chat::{try_parse as try_parse_twitch_send_chat, TwitchSendChat};

/// Re-export execute functions for use by the executor.
pub(crate) use ai_prompt::execute as execute_ai_prompt;
pub(crate) use database_query::execute as execute_database_query;
pub(crate) use delete_secret::execute as execute_delete_secret;
pub(crate) use get_secret::execute as execute_get_secret;
pub(crate) use list_secrets::execute as execute_list_secrets;
pub(crate) use script_rhai::execute as execute_script_rhai;
pub(crate) use set_secret::execute as execute_set_secret;
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
        "ai/prompt" => NodeRole::Transformer,
        "script/rhai" => NodeRole::Transformer,
        "secrets/get" => NodeRole::Transformer,
        "secrets/list" => NodeRole::Transformer,
        "secrets/set" => NodeRole::ResultAction,
        "secrets/delete" => NodeRole::ResultAction,
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
    SetSecret(SetSecret),
    ListSecrets(ListSecrets),
    DeleteSecret(DeleteSecret),
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
            TypedNode::SetSecret(_) => NodeRole::ResultAction,
            TypedNode::ListSecrets(_) => NodeRole::Transformer,
            TypedNode::DeleteSecret(_) => NodeRole::ResultAction,
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
            TypedNode::SetSecret(n) => n.id,
            TypedNode::ListSecrets(n) => n.id,
            TypedNode::DeleteSecret(n) => n.id,
        }
    }
}

/// Returns the byte offset of the `n`-th Unicode character in `s`,
/// or `s.len()` if `s` has fewer than `n` characters.
fn char_byte_offset(s: &str, n: usize) -> usize {
    s.char_indices().nth(n).map(|(i, _)| i).unwrap_or(s.len())
}

/// Splits a message into chunks, trying to break at a word boundary.
///
/// - Prefers to split at or before `preferred` characters.
/// - If no space is found scanning backwards from `preferred`, scans forwards
///   up to `hard_limit` characters to avoid cutting a word in half.
/// - Only hard-splits at `hard_limit` if no space exists in the entire window
///   (e.g. a single word longer than the limit).
pub(crate) fn split_message(message: &str, preferred: usize, hard_limit: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut remaining = message;
    while !remaining.is_empty() {
        if remaining.chars().count() <= hard_limit {
            chunks.push(remaining.to_string());
            break;
        }
        let preferred_byte = char_byte_offset(remaining, preferred);
        let hard_byte = char_byte_offset(remaining, hard_limit);

        let split_byte = if let Some(pos) = remaining[..preferred_byte].rfind(' ') {
            // Found a space at or before the preferred boundary.
            pos
        } else if let Some(rel) = remaining[preferred_byte..hard_byte].find(' ') {
            // No space before preferred, but one exists before the hard limit —
            // scan forwards to keep the current word whole.
            preferred_byte + rel
        } else {
            // No space anywhere in the window; hard-split at the limit.
            hard_byte
        };

        chunks.push(remaining[..split_byte].to_string());
        remaining = remaining[split_byte..].trim_start();
    }
    chunks
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
    if let Some(n) = try_parse_set_secret(node) {
        return Some(TypedNode::SetSecret(n));
    }
    if let Some(n) = try_parse_list_secrets(node) {
        return Some(TypedNode::ListSecrets(n));
    }
    if let Some(n) = try_parse_delete_secret(node) {
        return Some(TypedNode::DeleteSecret(n));
    }
    if let Some(n) = try_parse_generic_event_source(node) {
        return Some(TypedNode::GenericEventSource(n));
    }
    if let Some(n) = try_parse_timer_interval(node) {
        return Some(TypedNode::TimerInterval(n));
    }
    None
}
