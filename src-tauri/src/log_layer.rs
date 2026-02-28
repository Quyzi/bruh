//! Custom tracing layer that emits log events to the frontend webview.

use serde::Serialize;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Runtime};
use tracing::field::{Field, Visit};
use tracing_subscriber::Layer;

/// Payload for log events sent to the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogPayload {
    /// Log level: 1=Trace, 2=Debug, 3=Info, 4=Warn, 5=Error
    pub level: u8,
    /// The tracing target (module path)
    pub target: String,
    /// The main log message
    pub message: String,
    /// Additional structured fields
    pub fields: HashMap<String, String>,
}

/// A tracing layer that emits log events to the webview via Tauri events.
///
/// This layer captures all fields from tracing events (not just the message)
/// and sends them to the frontend via the `tracing://log` event.
///
/// Events with `target = "chat"` are filtered out as they will be handled
/// separately for channel message display.
pub struct WebviewLogLayer<R: Runtime> {
    app_handle: AppHandle<R>,
}

impl<R: Runtime> WebviewLogLayer<R> {
    /// Creates a new WebviewLogLayer that forwards log events to the given app handle.
    pub fn new(app_handle: AppHandle<R>) -> Self {
        Self { app_handle }
    }
}

impl<S, R: Runtime> Layer<S> for WebviewLogLayer<R>
where
    S: tracing::Subscriber,
{
    fn on_event(
        &self,
        event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        let metadata = event.metadata();

        // Skip chat target - will be handled separately for channel messages
        if metadata.target() == "chat" {
            return;
        }

        let mut visitor = FieldVisitor::default();
        event.record(&mut visitor);

        let level = match *metadata.level() {
            tracing::Level::TRACE => 1,
            tracing::Level::DEBUG => 2,
            tracing::Level::INFO => 3,
            tracing::Level::WARN => 4,
            tracing::Level::ERROR => 5,
        };

        let payload = LogPayload {
            level,
            target: metadata.target().to_string(),
            message: visitor.message,
            fields: visitor.fields,
        };

        let _ = self.app_handle.emit("tracing://log", payload);
    }
}

/// Visitor that collects all fields from a tracing event.
#[derive(Default)]
struct FieldVisitor {
    message: String,
    fields: HashMap<String, String>,
}

impl Visit for FieldVisitor {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        let value_str = format!("{:?}", value);
        if field.name() == "message" {
            self.message = value_str;
        } else {
            self.fields.insert(field.name().to_string(), value_str);
        }
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            self.message = value.to_string();
        } else {
            self.fields
                .insert(field.name().to_string(), value.to_string());
        }
    }

    fn record_i64(&mut self, field: &Field, value: i64) {
        self.fields
            .insert(field.name().to_string(), value.to_string());
    }

    fn record_u64(&mut self, field: &Field, value: u64) {
        self.fields
            .insert(field.name().to_string(), value.to_string());
    }

    fn record_bool(&mut self, field: &Field, value: bool) {
        self.fields
            .insert(field.name().to_string(), value.to_string());
    }

    fn record_f64(&mut self, field: &Field, value: f64) {
        self.fields
            .insert(field.name().to_string(), value.to_string());
    }
}
