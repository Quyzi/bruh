//! EventSub WebSocket loop, token refresh, and notification dispatch.

use std::collections::HashSet;
use std::sync::Arc;

use futures_util::StreamExt;
use tokio::sync::RwLock;

use twitch_api::twitch_oauth2::TwitchToken;

use tokio::sync::broadcast;

use tauri::Emitter;

use crate::auth::{load_token_from_secrets, save_token_to_secrets, AuthError, ReqwestTwitchAuth};
use crate::channels::load_channels_from_path;
use crate::config::{expand_tilde, Config};
use crate::metrics;
use crate::runtime::events::{DashboardChatPayload, PipelineEvent};
use crate::runtime::pipeline;
use crate::runtime::RuntimeState;
use crate::Secrets;

/// Minimum interval between token refreshes (5 minutes).
const TOKEN_REFRESH_MIN_INTERVAL_SECS: u64 = 5 * 60;
/// Fraction of token lifespan after which we refresh (75%).
const TOKEN_REFRESH_LIFESPAN_FRACTION: u64 = 75;

/// EventSub WebSocket URL.
const EVENTSUB_WS_URL: &str = "wss://eventsub.wss.twitch.tv/ws";

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

/// Background loop: refresh token on startup, then every max(5 min, 75% of token lifespan).
pub async fn token_refresher_loop(auth: Arc<ReqwestTwitchAuth>, secrets: Secrets) {
    loop {
        let token = match auth.get_token().await {
            Ok(t) => t,
            Err(AuthError::NotAuthorized) => {
                if let Ok((access, refresh)) = load_token_from_secrets(secrets.as_ref()) {
                    if auth.load_from_tokens(access, refresh).await.is_ok() {
                        match auth.get_token().await {
                            Ok(t) => t,
                            Err(e) => {
                                metrics::record_auth_token_refresh_failure();
                                tracing::warn!(
                                    "Token refresher: failed to get token after load: {}",
                                    e
                                );
                                sleep_and_retry().await;
                                continue;
                            }
                        }
                    } else {
                        sleep_and_retry().await;
                        continue;
                    }
                } else {
                    metrics::record_auth_token_refresh_failure();
                    tracing::warn!("Token refresher: no token in secrets");
                    sleep_and_retry().await;
                    continue;
                }
            }
            Err(e) => {
                metrics::record_auth_token_refresh_failure();
                tracing::warn!("Token refresher: failed to get token: {}", e);
                sleep_and_retry().await;
                continue;
            }
        };

        if let Err(error) = save_token_to_secrets(secrets.as_ref(), &token) {
            metrics::record_auth_token_refresh_failure();
            tracing::warn!(
                "Token refresher: failed to save token to secrets: {}",
                error
            );
        }

        let lifespan_secs = token.expires_in().as_secs();
        let refresh_after_secs = (lifespan_secs * TOKEN_REFRESH_LIFESPAN_FRACTION / 100)
            .max(TOKEN_REFRESH_MIN_INTERVAL_SECS);
        tokio::time::sleep(std::time::Duration::from_secs(refresh_after_secs)).await;
    }
}

async fn sleep_and_retry() {
    tokio::time::sleep(std::time::Duration::from_secs(
        TOKEN_REFRESH_MIN_INTERVAL_SECS,
    ))
    .await;
}

/// Builds a dashboard chat payload from a channel.chat.message JSON payload.
/// Handles twitch_api serialization: Event is {"ChannelChatMessageV1": Payload{subscription, message}},
/// Payload.message is Message::Notification(event) so serialized as {"Notification": event}.
fn dashboard_chat_payload_from_value(payload: &serde_json::Value) -> Option<DashboardChatPayload> {
    let message_obj = payload
        .get("ChannelChatMessageV1")
        .and_then(|v| v.get("message"));
    let inner = message_obj
        .and_then(|m| m.get("Notification"))
        .or_else(|| message_obj)
        .or_else(|| {
            payload.as_object().and_then(|o| {
                if o.len() == 1 {
                    let val = o.values().next()?;
                    val.get("message")
                        .and_then(|m| m.get("Notification"))
                        .or_else(|| val.get("message"))
                        .or(Some(val))
                } else {
                    None
                }
            })
        })
        .or_else(|| {
            payload
                .get("message")
                .and_then(|m| m.get("Notification").or(Some(m)))
        })
        .or(Some(payload))?;
    let channel = inner
        .get("broadcaster_user_login")
        .and_then(|v| v.as_str())
        .or_else(|| inner.get("broadcaster_user_id").and_then(|v| v.as_str()))?;
    let username = inner
        .get("chatter_user_login")
        .and_then(|v| v.as_str())
        .or_else(|| inner.get("chatter_user_name").and_then(|v| v.as_str()))
        .or_else(|| inner.get("chatter_user_id").and_then(|v| v.as_str()))?;
    let message_text = inner
        .get("message")
        .and_then(|m| m.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();
    let message_id = inner
        .get("message_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let user_id = inner
        .get("chatter_user_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let color = inner
        .get("color")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string());
    Some(DashboardChatPayload {
        channel: channel.to_string(),
        username: username.to_string(),
        message: message_text,
        timestamp,
        message_id,
        user_id,
        color,
    })
}

/// Connects to EventSub WebSocket, subscribes to workflow event types, and dispatches notifications.
/// When `reconnect_rx` receives a message, the loop reconnects and re-subscribes (e.g. after workflow save).
pub async fn run_eventsub_loop(
    workflow: Arc<RwLock<serde_json::Value>>,
    config: Config,
    secrets: Secrets,
    authenticator: Option<Arc<ReqwestTwitchAuth>>,
    _state: Arc<RwLock<RuntimeState>>,
    event_tx: broadcast::Sender<PipelineEvent>,
    reconnect_rx: &mut broadcast::Receiver<()>,
    app_handle: Option<tauri::AppHandle>,
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
        let url = next_url
            .take()
            .unwrap_or_else(|| EVENTSUB_WS_URL.to_string());
        let (ws_stream, _) = tokio_tungstenite::connect_async(&url)
            .await
            .map_err(|e| anyhow::anyhow!("EventSub WebSocket connect: {}", e))?;

        let (write, mut read) = ws_stream.split();
        use tokio_tungstenite::tungstenite::Message;
        let welcome_text = loop {
            let welcome_msg = read
                .next()
                .await
                .ok_or_else(|| anyhow::anyhow!("EventSub: no welcome message"))??;
            match &welcome_msg {
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
                    break s.clone();
                }
                _ => {
                    tracing::trace!("EventSub: skipping non-text welcome frame (Ping/Pong/Binary)");
                }
            }
        };
        let welcome: serde_json::Value = serde_json::from_str(&welcome_text)
            .map_err(|e| anyhow::anyhow!("EventSub welcome parse: {}", e))?;
        let session_id = welcome
            .get("payload")
            .and_then(|p| p.get("session"))
            .and_then(|s| s.get("id"))
            .and_then(|id| id.as_str())
            .ok_or_else(|| anyhow::anyhow!("EventSub: no session id in welcome"))?
            .to_string();

        let helix = auth.helix_client();
        let mut event_types = {
            let graph_guard = workflow.read().await;
            workflow_event_types(&*graph_guard)
        };
        let broadcaster_ids = {
            let mut ids = vec![broadcaster_id.clone()];
            let channels_path = expand_tilde(&config.channels);
            let channels = load_channels_from_path(&channels_path);
            if !channels.is_empty() {
                use twitch_api::helix::users::get_users;
                let logins: Vec<&str> = channels.iter().map(|c| c.login.as_str()).collect();
                let request = get_users::GetUsersRequest::logins(&logins);
                match helix.req_get(request, &token).await {
                    Ok(response) => {
                        for user in response.data {
                            ids.push(user.id);
                        }
                    }
                    Err(e) => {
                        tracing::warn!("EventSub: resolve channel logins: {}", e);
                    }
                }
            }
            ids.sort_by_key(|id| id.as_str().to_string());
            ids.dedup_by(|a, b| a.as_str() == b.as_str());
            ids
        };
        if !broadcaster_ids.is_empty() && !event_types.contains("channel.chat.message") {
            event_types.insert("channel.chat.message".to_string());
        }
        tracing::info!(
            broadcaster_count = broadcaster_ids.len(),
            "EventSub: subscribing for channels"
        );
        /// Event types that require the token user to be the broadcaster (Twitch returns 403 otherwise).
        const BROADCASTER_ONLY_EVENT_TYPES: &[&str] = &[
            "channel.follow",
            "channel.subscribe",
            "channel.subscription.gift",
        ];
        for event_type in &event_types {
            for bid in &broadcaster_ids {
                if BROADCASTER_ONLY_EVENT_TYPES.contains(&event_type.as_str())
                    && bid.as_str() != token.user_id().map(|u| u.as_str()).unwrap_or("")
                {
                    tracing::debug!(
                        event_type = %event_type,
                        broadcaster_id = %bid.as_str(),
                        "EventSub: skip (token user must be the channel owner for this event type)"
                    );
                    continue;
                }
                if let Err(error) =
                    subscribe_event_type(&helix, event_type.as_str(), &session_id, bid, &token)
                        .await
                {
                    let error_str = error.to_string();
                    let hint = if error_str.contains("403")
                        || error_str.to_lowercase().contains("authorization")
                    {
                        let scope_note = match event_type.as_str() {
                            "channel.follow" => "requires moderator:read:followers",
                            "channel.subscribe" => "requires channel:read:subscriptions",
                            _ => "check required scope for this event type",
                        };
                        format!(
                            " — {}; the token in use must have that scope. \
                             If you added it to twitch/scopes later, re-authorize (Setup → Twitch login) to get a new token.",
                            scope_note
                        )
                    } else {
                        String::new()
                    };
                    tracing::warn!(
                        event_type = %event_type,
                        broadcaster_id = %bid.as_str(),
                        "EventSub subscribe: {}{}",
                        error_str,
                        hint
                    );
                }
            }
        }
        drop(write);

        let mut message_loop_done = false;
        loop {
            tokio::select! {
                msg_result = read.next() => {
                    let msg = match msg_result {
                        Some(Ok(m)) => m,
                        Some(Err(e)) => return Err(anyhow::anyhow!("EventSub read: {}", e).into()),
                        None => break,
                    };
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
                            let subscription_type = format!("{}", metadata.subscription_type);
                            tracing::debug!(
                                subscription_type = %subscription_type,
                                "EventSub: received notification"
                            );
                                match serde_json::to_value(&payload) {
                                Ok(payload_value) => {
                                    let channel = pipeline::channel_for_event(
                                        &subscription_type,
                                        &payload_value,
                                    )
                                    .unwrap_or_else(|| "unknown".to_string());
                                    metrics::record_eventsub_event(&subscription_type, &channel);
                                    let pipeline_event = PipelineEvent {
                                        subscription_type: subscription_type.clone(),
                                        payload: payload_value.clone(),
                                    };
                                    if let Err(error) = event_tx.send(pipeline_event) {
                                        metrics::record_eventsub_event_dropped();
                                        tracing::trace!(
                                            "EventSub: pipeline channel full or no receivers, event dropped: {}",
                                            error
                                        );
                                    } else {
                                        tracing::trace!(
                                            subscription_type = %subscription_type,
                                            "EventSub: pipeline event sent"
                                        );
                                    }
                                    if subscription_type == "channel.chat.message" {
                                        if let Some(ref handle) = app_handle {
                                            match dashboard_chat_payload_from_value(&payload_value) {
                                                Some(dashboard_payload) => {
                                                    if let Err(error) =
                                                        handle.emit("dashboard://chat", &dashboard_payload)
                                                    {
                                                        tracing::warn!(
                                                            "EventSub: dashboard emit failed: {}",
                                                            error
                                                        );
                                                    } else {
                                                        tracing::debug!(
                                                            channel = %dashboard_payload.channel,
                                                            "EventSub: dashboard chat emitted"
                                                        );
                                                    }
                                                }
                                                None => {
                                                    tracing::warn!(
                                                        "EventSub: dashboard payload from value returned None (payload keys: {:?})",
                                                        payload_value.as_object().map(|o| o.keys().collect::<Vec<_>>())
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                                Err(error) => {
                                    tracing::debug!(
                                        "EventSub: skip pipeline event, payload serialize failed: {}",
                                        error
                                    );
                                }
                            }
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
                _ = reconnect_rx.recv() => {
                    message_loop_done = true;
                    tracing::info!("EventSub: reconnecting after workflow update to refresh subscriptions");
                    break;
                }
            }
        }
        if !message_loop_done {
            return Ok(());
        }
    }
}

/// Subscribes to a single event type via Helix (WebSocket transport).
/// For channel.chat.message, user_id must be the token holder (the bot reading chat).
pub async fn subscribe_event_type(
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
            let bot_user_id = token
                .user_id()
                .ok_or_else(|| anyhow::anyhow!("token has no user_id"))?
                .to_owned();
            let sub = twitch_api::eventsub::channel::ChannelChatMessageV1::new(
                broadcaster_id.clone(),
                bot_user_id,
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
        "channel.subscribe" => {
            let sub = twitch_api::eventsub::channel::ChannelSubscribeV1::broadcaster_user_id(
                broadcaster_id.clone(),
            );
            helix
                .create_eventsub_subscription(sub, transport, token)
                .await
                .map_err(|e| anyhow::anyhow!("{}", e))?;
        }
        "channel.subscription.gift" => {
            let sub = twitch_api::eventsub::channel::ChannelSubscriptionGiftV1::broadcaster_user_id(
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

/// Legacy: dispatches an EventSub notification to the workflow. Replaced by pipeline executor.
#[allow(dead_code)]
pub async fn dispatch_notification(
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
            let node_id = match node.get("id").and_then(|v| v.as_i64()) {
                Some(n) => n as i32,
                None => continue,
            };
            tracing::debug!(
                "EventSub trigger node {} event_type={}",
                node_id,
                subscription_type
            );
            run_downstream_from_trigger(&*graph, node_id, &event_json).await;
        }
    }
}

/// Legacy stub: runs downstream nodes from a trigger. Replaced by pipeline executor.
#[allow(dead_code)]
pub async fn run_downstream_from_trigger(
    _graph: &serde_json::Value,
    _trigger_node_id: i32,
    event_payload: &serde_json::Value,
) {
    tracing::debug!("EventSub dispatch payload: {}", event_payload);
}
