//! AI agent configuration management.

use std::fs;
use std::io::Write;

use anyhow::Context;
use serde::{Deserialize, Serialize};

use crate::config::{expand_tilde, Config};

pub mod commands;

fn default_max_tokens() -> u64 {
    4096
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiAgent {
    pub name: String,
    pub provider: String,
    pub model: String,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u64,
    /// Sampling temperature (0.0–2.0). None means use the provider's default.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    /// System prompt / preamble sent before every user message.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preamble: Option<String>,
    /// Base URL override for local providers (ollama, llamafile).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}

/// Derives the secrets key for an agent: "ai/{provider}/{name_slug}"
pub fn agent_secret_key(provider: &str, name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect::<String>();
    let slug = slug
        .split('_')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("_");
    format!("ai/{}/{}", provider, slug)
}

pub fn load_agents(config: &Config) -> anyhow::Result<Vec<AiAgent>> {
    let path = expand_tilde(&config.ai_agents);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read ai_agents from {}", path.display()))?;
    let agents: Vec<AiAgent> =
        serde_json::from_str(&content).with_context(|| "Failed to parse ai_agents.json")?;
    Ok(agents)
}

pub fn save_agents(config: &Config, agents: &[AiAgent]) -> anyhow::Result<()> {
    let path = expand_tilde(&config.ai_agents);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(agents)?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&path)
        .with_context(|| format!("Failed to open {} for writing", path.display()))?;
    file.write_all(content.as_bytes())?;
    Ok(())
}
