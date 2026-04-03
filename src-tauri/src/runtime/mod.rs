//! Runtime: workflow parsing, node types, workflow I/O, and execution (Twitch auth, EventSub, start/stop).

pub mod commands;
mod events;
mod eventsub;
mod executor;
mod graph;
mod nodes;
mod parse;
mod pipeline;
mod timer;

pub use nodes::ai_prompt_call_provider;
pub use commands::{
    get_runtime_state, load_workflow, load_workflow_from_path, runtime_start, runtime_stop,
    save_workflow,
};
pub use events::{PipelineEvent, PIPELINE_EVENT_CHANNEL_CAPACITY};
pub use eventsub::workflow_event_types;
pub use graph::{Link, SerializedGroup, WorkflowGraph};
pub use nodes::{
    GetSecret, NodeRole, ScriptRhai, TwitchChatMessagePrefix, TwitchSendChat, TypedNode,
};
pub use parse::{parse_workflow, ApplicationStructure, SourcePath};
pub use pipeline::Pipeline;
pub use runtime::{Runtime, RuntimeState};

mod runtime {
    use std::collections::HashSet;
    use std::sync::Arc;

    use serde::Serialize;
    use tokio::sync::broadcast;
    use tokio::sync::RwLock;
    use tokio::task::JoinHandle;

    use crate::auth::create_twitch_auth;
    use crate::config::Config;
    use crate::Database;
    use crate::Secrets;

    use super::events::{PipelineEvent, PIPELINE_EVENT_CHANNEL_CAPACITY};
    use super::eventsub;
    use super::executor;
    use super::pipeline::Pipeline;
    use super::timer;
    use super::workflow_event_types;

    /// Runtime state: stopped or running.
    #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
    #[serde(rename_all = "lowercase")]
    pub enum RuntimeState {
        Stopped,
        Running,
    }

    impl RuntimeState {
        pub fn as_str(&self) -> &'static str {
            match self {
                RuntimeState::Stopped => "stopped",
                RuntimeState::Running => "running",
            }
        }
    }

    /// Runtime: owns workflow, Twitch auth, token refresher, EventSub task, executor, and pipeline event channel.
    pub struct Runtime {
        pub state: Arc<RwLock<RuntimeState>>,
        pub config: Config,
        pub secrets: Secrets,
        pub workflow: Arc<RwLock<serde_json::Value>>,
        pub event_tx: broadcast::Sender<PipelineEvent>,
        /// Sending on this triggers EventSub to reconnect and re-subscribe (e.g. after workflow save).
        pub event_sub_reconnect_tx: broadcast::Sender<()>,
        pub authenticator: Option<Arc<crate::auth::ReqwestTwitchAuth>>,
        pub database: Option<Database>,
        pub refresher_handle: Option<JoinHandle<()>>,
        pub eventsub_handle: Option<JoinHandle<()>>,
        pub executor_handle: Option<JoinHandle<()>>,
        pub timer_handle: Option<JoinHandle<()>>,
    }

    impl Runtime {
        /// Builds a new Runtime with the given config, secrets, initial workflow, and optional database.
        pub fn new(
            config: Config,
            secrets: Secrets,
            initial_workflow: serde_json::Value,
            database: Option<Database>,
        ) -> Self {
            let authenticator = create_twitch_auth(secrets.as_ref()).ok().map(Arc::new);
            let (event_tx, _) = broadcast::channel(PIPELINE_EVENT_CHANNEL_CAPACITY);
            let (event_sub_reconnect_tx, _) = broadcast::channel(4);
            Self {
                state: Arc::new(RwLock::new(RuntimeState::Stopped)),
                config,
                secrets,
                workflow: Arc::new(RwLock::new(initial_workflow)),
                event_tx,
                event_sub_reconnect_tx,
                authenticator,
                database,
                refresher_handle: None,
                eventsub_handle: None,
                executor_handle: None,
                timer_handle: None,
            }
        }

        /// Returns the set of EventSub event type strings present in the workflow.
        pub fn workflow_event_types(graph: &serde_json::Value) -> HashSet<String> {
            workflow_event_types(graph)
        }

        /// Starts the runtime: sets state to Running and spawns token refresher and EventSub tasks.
        /// `app_handle` is used to emit dashboard chat events when the runtime receives chat messages.
        pub async fn start(&mut self, app_handle: tauri::AppHandle) -> Result<(), anyhow::Error> {
            let mut state_guard = self.state.write().await;
            match *state_guard {
                RuntimeState::Running => return Ok(()),
                RuntimeState::Stopped => {}
            }

            if let Some(ref auth) = self.authenticator {
                let secrets = self.secrets.clone();
                let auth_clone = auth.clone();
                let handle = tokio::spawn(async move {
                    eventsub::token_refresher_loop(auth_clone, secrets).await;
                });
                self.refresher_handle = Some(handle);
            }

            if self.authenticator.is_some() {
                let workflow = self.workflow.clone();
                let config = self.config.clone();
                let secrets = self.secrets.clone();
                let authenticator = self.authenticator.clone();
                let state = self.state.clone();
                let event_tx = self.event_tx.clone();
                let mut reconnect_rx = self.event_sub_reconnect_tx.subscribe();
                let app_handle_for_eventsub = Some(app_handle.clone());
                let handle = tokio::spawn(async move {
                    if let Err(error) = eventsub::run_eventsub_loop(
                        workflow,
                        config,
                        secrets,
                        authenticator,
                        state,
                        event_tx,
                        &mut reconnect_rx,
                        app_handle_for_eventsub,
                    )
                    .await
                    {
                        tracing::warn!("EventSub loop ended: {}", error);
                    }
                });
                self.eventsub_handle = Some(handle);
            } else {
                tracing::info!("Runtime started without Twitch auth; EventSub not started");
            }

            let workflow = self.workflow.clone();
            let config = self.config.clone();
            let authenticator = self.authenticator.clone();
            let database = self.database.clone();
            let secrets = self.secrets.clone();
            let event_rx = self.event_tx.subscribe();
            let pipeline = Pipeline::default();
            let handle = tokio::spawn(async move {
                executor::executor_loop(
                    workflow,
                    pipeline,
                    config,
                    authenticator,
                    database,
                    secrets,
                    event_rx,
                )
                .await;
            });
            self.executor_handle = Some(handle);

            let workflow_timer = self.workflow.clone();
            let event_tx_timer = self.event_tx.clone();
            let state_timer = self.state.clone();
            let timer_handle = tokio::spawn(async move {
                timer::run_timer_loop(workflow_timer, event_tx_timer, state_timer).await;
            });
            self.timer_handle = Some(timer_handle);

            *state_guard = RuntimeState::Running;
            Ok(())
        }

        /// Stops the runtime and aborts background tasks.
        pub async fn stop(&mut self) {
            if let Some(handle) = self.refresher_handle.take() {
                handle.abort();
                let _ = handle.await;
            }
            if let Some(handle) = self.eventsub_handle.take() {
                handle.abort();
                let _ = handle.await;
            }
            if let Some(handle) = self.executor_handle.take() {
                handle.abort();
                let _ = handle.await;
            }
            if let Some(handle) = self.timer_handle.take() {
                handle.abort();
                let _ = handle.await;
            }
            *self.state.write().await = RuntimeState::Stopped;
        }
    }
}
