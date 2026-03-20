//! Tauri commands for AI agent configuration management.

use tauri::State;

use crate::config::Config;
use crate::secrets::SecretsProvider;
use crate::setup::CommandError;
use crate::Secrets;

use super::{agent_secret_key, load_agents, save_agents, AiAgent};

#[tauri::command]
pub async fn list_ai_agents(config: State<'_, Config>) -> Result<Vec<AiAgent>, CommandError> {
    load_agents(&config).map_err(|e| CommandError {
        message: e.to_string(),
    })
}

#[tauri::command]
pub async fn set_ai_agent(agent: AiAgent, config: State<'_, Config>) -> Result<(), CommandError> {
    if agent.name.trim().is_empty() {
        return Err(CommandError {
            message: "Agent name cannot be empty".to_string(),
        });
    }
    let mut agents = load_agents(&config).map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    if let Some(existing) = agents.iter_mut().find(|a| a.name == agent.name) {
        *existing = agent;
    } else {
        agents.push(agent);
    }
    save_agents(&config, &agents).map_err(|e| CommandError {
        message: e.to_string(),
    })
}

#[tauri::command]
pub async fn delete_ai_agent(
    name: String,
    config: State<'_, Config>,
    secrets: State<'_, Secrets>,
) -> Result<(), CommandError> {
    let mut agents = load_agents(&config).map_err(|e| CommandError {
        message: e.to_string(),
    })?;
    if let Some(agent) = agents.iter().find(|a| a.name == name) {
        let key = agent_secret_key(&agent.provider, &agent.name);
        let _ = secrets.delete(&key); // best-effort; ignore NotFound
    }
    agents.retain(|a| a.name != name);
    save_agents(&config, &agents).map_err(|e| CommandError {
        message: e.to_string(),
    })
}
