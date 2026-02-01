//! Executor for workflow graphs: Twitch auth, token refresh, EventSub, and execution.

use std::collections::HashSet;
use std::sync::Arc;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::State;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use twitch_api::twitch_oauth2::TwitchToken;

use crate::auth::{
    load_token_from_secrets, save_token_to_secrets, AuthError, ReqwestTwitchAuth,
};
use crate::config::Config;
use crate::setup::CommandError;
use crate::Secrets;

/// Interval at which the token refresher runs (refresh before expiry).
const TOKEN_REFRESH_INTERVAL_SECS: u64 = 30 * 60; // 30 minutes

/// Runtime state of the executor.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ExecutorState {
    Stopped,
    Running,
}

/// Executor: owns workflow, Twitch auth, token refresher, and EventSub task.
/// Rhai engine is created per execution (engine is not Send+Sync).
pub struct Executor {
    pub state: Arc<RwLock<ExecutorState>>,
    pub config: Config,
    pub secrets: Secrets,
    pub workflow: Arc<RwLock<serde_json::Value>>,
    pub authenticator: Option<Arc<ReqwestTwitchAuth>>,
    pub refresher_handle: Option<JoinHandle<()>>,
    pub eventsub_handle: Option<JoinHandle<()>>,
}

impl Executor {
    /// Builds a new Executor with the given config, secrets, and initial workflow.
    /// Twitch auth is created from secrets if credentials are present; otherwise None.
    pub fn new(config: Config, secrets: Secrets, initial_workflow: serde_json::Value) -> Self {
        let authenticator = crate::auth::create_twitch_auth(secrets.as_ref())
            .ok()
            .map(Arc::new);
        Self {
            state: Arc::new(RwLock::new(ExecutorState::Stopped)),
            config,
            secrets,
            workflow: Arc::new(RwLock::new(initial_workflow)),
            authenticator,
            refresher_handle: None,
            eventsub_handle: None,
        }
    }

    /// Returns the set of EventSub event type strings present in the workflow (from trigger nodes).
    pub fn workflow_event_types(graph: &serde_json::Value) -> HashSet<String> {
        let mut types = HashSet::new();
        let nodes = graph.get("nodes").and_then(|n| n.as_array());
        if let Some(nodes) = nodes {
            for node in nodes {
                if let Some(props) = node.get("properties") {
                    if let Some(event_type) = props.get("eventType").and_then(|v| v.as_str()) {
                        types.insert(event_type.to_string());
                    }
                }
            }
        }
        types
    }

    /// Starts the executor: sets state to Running and spawns token refresher and EventSub tasks.
    pub async fn start(&mut self) -> Result<(), anyhow::Error> {
        let mut state_guard = self.state.write().await;
        match *state_guard {
            ExecutorState::Running => {
                return Ok(());
            }
            ExecutorState::Stopped => {}
        }

        if let Some(ref auth) = self.authenticator {
            let secrets = self.secrets.clone();
            let auth_clone = auth.clone();
            let handle = tokio::spawn(async move {
                token_refresher_loop(auth_clone, secrets).await;
            });
            self.refresher_handle = Some(handle);
        }

        if self.authenticator.is_some() {
            let workflow = self.workflow.clone();
            let config = self.config.clone();
            let secrets = self.secrets.clone();
            let authenticator = self.authenticator.clone();
            let state = self.state.clone();
            let handle = tokio::spawn(async move {
                if let Err(error) =
                    run_eventsub_loop(workflow, config, secrets, authenticator, state).await
                {
                    tracing::warn!("EventSub loop ended: {}", error);
                }
            });
            self.eventsub_handle = Some(handle);
        } else {
            tracing::info!("Executor started without Twitch auth; EventSub not started");
        }

        *state_guard = ExecutorState::Running;
        Ok(())
    }

    /// Stops the executor: sets state to Stopped and aborts refresher and EventSub tasks.
    pub async fn stop(&mut self) {
        if let Some(handle) = self.refresher_handle.take() {
            handle.abort();
            let _ = handle.await;
        }
        if let Some(handle) = self.eventsub_handle.take() {
            handle.abort();
            let _ = handle.await;
        }
        *self.state.write().await = ExecutorState::Stopped;
    }
}

/// Background loop: periodically refresh token and persist to secrets.
/// If the auth has no token in memory, loads from secrets first (same as EventSub).
async fn token_refresher_loop(auth: Arc<ReqwestTwitchAuth>, secrets: Secrets) {
    let mut interval =
        tokio::time::interval(std::time::Duration::from_secs(TOKEN_REFRESH_INTERVAL_SECS));
    interval.tick().await;
    loop {
        interval.tick().await;
        let token = match auth.get_token().await {
            Ok(t) => t,
            Err(AuthError::NotAuthorized) => {
                if let Ok((access, refresh)) = load_token_from_secrets(secrets.as_ref()) {
                    if auth.load_from_tokens(access, refresh).await.is_ok() {
                        match auth.get_token().await {
                            Ok(t) => t,
                            Err(e) => {
                                tracing::warn!("Token refresher: failed to get token after load: {}", e);
                                continue;
                            }
                        }
                    } else {
                        continue;
                    }
                } else {
                    tracing::warn!("Token refresher: no token in secrets");
                    continue;
                }
            }
            Err(e) => {
                tracing::warn!("Token refresher: failed to get token: {}", e);
                continue;
            }
        };
        if let Err(error) = save_token_to_secrets(secrets.as_ref(), &token) {
            tracing::warn!("Token refresher: failed to save token to secrets: {}", error);
        }
    }
}

/// EventSub WebSocket URL.
const EVENTSUB_WS_URL: &str = "wss://eventsub.wss.twitch.tv/ws";

/// Connects to EventSub WebSocket, subscribes to workflow event types, and dispatches notifications.
async fn run_eventsub_loop(
    workflow: Arc<RwLock<serde_json::Value>>,
    _config: Config,
    secrets: Secrets,
    authenticator: Option<Arc<ReqwestTwitchAuth>>,
    _state: Arc<RwLock<ExecutorState>>,
) -> Result<(), anyhow::Error> {
    let auth = match authenticator {
        Some(a) => a,
        None => return Ok(()),
    };
    let token = match auth.get_token().await {
        Ok(t) => t,
        Err(AuthError::NotAuthorized) => {
            let (access, refresh) = load_token_from_secrets(secrets.as_ref())
                .map_err(|e| anyhow::anyhow!("no token in secrets: {}", e))?;
            auth.load_from_tokens(access, refresh)
                .await
                .map_err(|e| anyhow::anyhow!("{}", e))?;
            auth.get_token()
                .await
                .map_err(|e| anyhow::anyhow!("{}", e))?
        }
        Err(e) => return Err(anyhow::anyhow!("{}", e).into()),
    };
    let broadcaster_id = token
        .user_id()
        .ok_or_else(|| anyhow::anyhow!("token has no user_id"))?
        .to_owned();

    let mut next_url: Option<String> = None;
    loop {
        let url = next_url.take().unwrap_or_else(|| EVENTSUB_WS_URL.to_string());
        let (ws_stream, _) = tokio_tungstenite::connect_async(&url)
            .await
            .map_err(|e| anyhow::anyhow!("EventSub WebSocket connect: {}", e))?;

        let (write, mut read) = ws_stream.split();
        let welcome_msg = read
            .next()
            .await
            .ok_or_else(|| anyhow::anyhow!("EventSub: no welcome message"))??;
        use tokio_tungstenite::tungstenite::Message;
        let text = match &welcome_msg {
            Message::Close(close_frame) => {
                let (code, reason) = close_frame
                    .as_ref()
                    .map(|f| (f.code.into(), f.reason.to_string()))
                    .unwrap_or((0u16, String::new()));
                return Err(anyhow::anyhow!(
                    "EventSub server closed connection (code: {}, reason: {}). \
                     Check token scopes and that you subscribe within 10s of connecting.",
                    code,
                    reason
                )
                .into());
            }
            Message::Text(s) => {
                if s.is_empty() {
                    return Err(anyhow::anyhow!(
                        "EventSub server sent empty message (connection may have closed unexpectedly)"
                    )
                    .into());
                }
                s.as_str()
            }
            _ => {
                return Err(anyhow::anyhow!(
                    "EventSub: expected welcome text message, got other frame type"
                )
                .into());
            }
        };
        let welcome: serde_json::Value =
            serde_json::from_str(text).map_err(|e| anyhow::anyhow!("EventSub welcome parse: {}", e))?;
        let session_id = welcome
            .get("payload")
            .and_then(|p| p.get("session"))
            .and_then(|s| s.get("id"))
            .and_then(|id| id.as_str())
            .ok_or_else(|| anyhow::anyhow!("EventSub: no session id in welcome"))?
            .to_string();

        let helix = twitch_api::HelixClient::<reqwest::Client>::default();
        let event_types = {
            let graph_guard = workflow.read().await;
            Executor::workflow_event_types(&*graph_guard)
        };
        for event_type in &event_types {
            if let Err(error) = subscribe_event_type(
                &helix,
                event_type.as_str(),
                &session_id,
                &broadcaster_id,
                &token,
            )
            .await
            {
                tracing::warn!("EventSub subscribe {}: {}", event_type, error);
            }
        }
        drop(write);

        let mut message_loop_done = false;
        while let Some(msg_result) = read.next().await {
            let msg = msg_result.map_err(|e| anyhow::anyhow!("EventSub read: {}", e))?;
            let text = match msg.to_text() {
                Ok(t) => t.to_string(),
                Err(_) => continue,
            };
            let parsed: serde_json::Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let message_type = parsed
                .get("metadata")
                .and_then(|m| m.get("message_type"))
                .and_then(|t| t.as_str())
                .unwrap_or("");
            match message_type {
                "session_keepalive" => {}
                "notification" => {
                    if let Ok(ws_data) = twitch_api::eventsub::Event::parse_websocket(&text) {
                        if let twitch_api::eventsub::EventsubWebsocketData::Notification {
                            metadata,
                            payload,
                        } = ws_data
                        {
                            dispatch_notification(&workflow, &metadata, &payload).await;
                        }
                    }
                }
                "session_reconnect" => {
                    let reconnect_url = parsed
                        .get("payload")
                        .and_then(|p| p.get("session"))
                        .and_then(|s| s.get("reconnect_url"))
                        .and_then(|u| u.as_str())
                        .map(String::from);
                    if let Some(url) = reconnect_url {
                        tracing::info!("EventSub reconnect to {}", url);
                        next_url = Some(url);
                        message_loop_done = true;
                        break;
                    }
                }
                "revocation" => {
                    tracing::warn!("EventSub subscription revoked");
                }
                _ => {}
            }
        }
        if !message_loop_done {
            return Ok(());
        }
    }
}

/// Subscribes to a single event type via Helix (WebSocket transport).
async fn subscribe_event_type(
    helix: &twitch_api::HelixClient<'static, reqwest::Client>,
    event_type: &str,
    session_id: &str,
    broadcaster_id: &twitch_api::types::UserId,
    token: &twitch_api::twitch_oauth2::UserToken,
) -> Result<(), anyhow::Error> {
    use twitch_api::eventsub::Transport;
    let transport = Transport::websocket(session_id.to_string());
    match event_type {
        "channel.chat.message" => {
            let sub = twitch_api::eventsub::channel::ChannelChatMessageV1::new(
                broadcaster_id.clone(),
                broadcaster_id.clone(),
            );
            helix
                .create_eventsub_subscription(sub, transport, token)
                .await
                .map_err(|e| anyhow::anyhow!("{}", e))?;
        }
        "channel.follow" => {
            let sub = twitch_api::eventsub::channel::ChannelFollowV2::new(
                broadcaster_id.clone(),
                broadcaster_id.clone(),
            );
            helix
                .create_eventsub_subscription(sub, transport, token)
                .await
                .map_err(|e| anyhow::anyhow!("{}", e))?;
        }
        _ => return Err(anyhow::anyhow!("unsupported event type: {}", event_type)),
    }
    Ok(())
}

/// Dispatches an EventSub notification to the workflow (find trigger nodes, run downstream).
async fn dispatch_notification(
    workflow: &Arc<RwLock<serde_json::Value>>,
    metadata: &twitch_api::eventsub::event::websocket::NotificationMetadata<'_>,
    payload: &twitch_api::eventsub::Event,
) {
    let subscription_type = format!("{}", metadata.subscription_type);
    let event_json = serde_json::to_value(payload).unwrap_or(serde_json::Value::Null);
    let graph = workflow.read().await;
    let nodes = graph.get("nodes").and_then(|n| n.as_array());
    if let Some(nodes) = nodes {
        for node in nodes {
            let props = match node.get("properties") {
                Some(p) => p,
                None => continue,
            };
            let node_event_type = match props.get("eventType").and_then(|v| v.as_str()) {
                Some(t) => t,
                None => continue,
            };
            if node_event_type != subscription_type {
                continue;
            }
            let node_id = node.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
            tracing::debug!(
                "EventSub trigger node {} event_type={}",
                node_id,
                subscription_type
            );
            run_downstream_from_trigger(&*graph, node_id as i32, &event_json).await;
        }
    }
}

/// Runs downstream nodes from a trigger (script nodes etc.). Stub: only logs.
async fn run_downstream_from_trigger(
    _graph: &serde_json::Value,
    _trigger_node_id: i32,
    event_payload: &serde_json::Value,
) {
    tracing::debug!("EventSub dispatch payload: {}", event_payload);
}

/// Tauri command: starts the executor (token refresher and EventSub).
#[tauri::command]
pub async fn executor_start(
    executor: State<'_, Arc<RwLock<Executor>>>,
) -> Result<(), CommandError> {
    let exec = executor.inner().clone();
    let mut guard = exec.write().await;
    guard.start().await.map_err(|e| CommandError {
        message: format!("Failed to start executor: {}", e),
    })
}

/// Tauri command: stops the executor and aborts background tasks.
#[tauri::command]
pub async fn executor_stop(
    executor: State<'_, Arc<RwLock<Executor>>>,
) -> Result<(), CommandError> {
    let exec = executor.inner().clone();
    let mut guard = exec.write().await;
    guard.stop().await;
    Ok(())
}

/// Tauri command: returns the current executor state (stopped or running).
#[tauri::command]
pub async fn get_executor_state(
    executor: State<'_, Arc<RwLock<Executor>>>,
) -> Result<ExecutorState, CommandError> {
    let exec = executor.inner().clone();
    let guard = exec.read().await;
    let state_value = *guard.state.read().await;
    Ok(state_value)
}
