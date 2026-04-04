//! Executes an ai/prompt node: sends a prompt to an AI provider and returns the response.

use std::collections::HashMap;

use serde_json::Value;

use crate::ai_agents::{agent_secret_key, load_agents};
use crate::config::Config;
use crate::metrics;
use crate::secrets::SecretsProvider;
use crate::Secrets;

/// Runs an ai/prompt node: sends the prompt (with substituted inputs) to the configured AI agent.
/// Use $1–$5 or ?1–?5 in the prompt template to reference input slot values.
pub async fn execute(
    node_value: &Value,
    inputs: HashMap<i32, Value>,
    secrets: &Secrets,
    config: &Config,
    node_groups: Option<&str>,
) -> Result<Vec<(i32, Value)>, anyhow::Error> {
    // Extract agentName
    let agent_name = node_value
        .get("properties")
        .and_then(|p| p.get("agentName"))
        .and_then(|v| v.as_str())
        .or_else(|| {
            node_value
                .get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.first())
                .and_then(|v| v.as_str())
        })
        .unwrap_or("")
        .trim()
        .to_string();

    // Extract prompt template
    let prompt_template = node_value
        .get("properties")
        .and_then(|p| p.get("prompt"))
        .and_then(|v| v.as_str())
        .or_else(|| {
            node_value
                .get("widgets_values")
                .and_then(|w| w.as_array())
                .and_then(|a| a.get(1))
                .and_then(|v| v.as_str())
        })
        .unwrap_or("")
        .to_string();

    if agent_name.is_empty() {
        tracing::warn!(groups = ?node_groups, "AI Prompt node has no agent selected, skip");
        return Ok(vec![(0, Value::String(String::new()))]);
    }

    // Load agent config
    let agents = load_agents(config)?;
    let agent = agents
        .iter()
        .find(|a| a.name == agent_name)
        .ok_or_else(|| anyhow::anyhow!("AI agent not found: {}", agent_name))?;

    // Get API key from secrets (skip for local providers)
    let api_key = match agent.provider.as_str() {
        "ollama" | "llamafile" => String::new(),
        _ => {
            let key = agent_secret_key(&agent.provider, &agent.name);
            secrets
                .get(&key)
                .map_err(|e| anyhow::anyhow!("Failed to get secret '{}': {}", key, e))?
        }
    };

    // Substitute placeholders in the prompt template
    let prompt = substitute_placeholders(&prompt_template, &inputs);

    // Call the AI provider
    metrics::record_ai_prompt_request(&agent_name, &agent.provider);
    let response = call_provider(
        &agent.provider,
        &agent.model,
        &api_key,
        agent.max_tokens,
        agent.temperature,
        agent.preamble.as_deref(),
        agent.base_url.as_deref(),
        &prompt,
    )
    .await
    .map_err(|e| {
        metrics::record_ai_prompt_error(&agent_name, &agent.provider);
        e
    })?;

    Ok(vec![(0, Value::String(response))])
}

fn substitute_placeholders(template: &str, inputs: &HashMap<i32, Value>) -> String {
    // Normalize $N → ?N
    let mut prompt = template.to_string();
    for i in 1..=5 {
        prompt = prompt.replace(&format!("${}", i), &format!("?{}", i));
    }
    // Sort inputs by slot index
    let mut slots: Vec<i32> = inputs.keys().copied().collect();
    slots.sort_unstable();
    // Substitute ?1–?5 with corresponding input values
    for (idx, slot) in slots.iter().take(5).enumerate() {
        let val = inputs[slot].as_str().unwrap_or("").to_string();
        prompt = prompt.replace(&format!("?{}", idx + 1), &val);
    }
    prompt
}

pub async fn call_provider(
    provider: &str,
    model: &str,
    api_key: &str,
    max_tokens: u64,
    temperature: Option<f64>,
    preamble: Option<&str>,
    base_url: Option<&str>,
    prompt: &str,
) -> anyhow::Result<String> {
    use rig::client::CompletionClient;
    use rig::completion::Prompt;

    macro_rules! build_agent {
        ($client:expr) => {{
            let mut b = $client.agent(model).max_tokens(max_tokens);
            if let Some(t) = temperature {
                b = b.temperature(t);
            }
            if let Some(p) = preamble {
                if !p.is_empty() {
                    b = b.preamble(p);
                }
            }
            b.build()
        }};
    }

    match provider {
        "openai" => {
            let client = rig::providers::openai::Client::new(api_key)
                .map_err(|e| anyhow::anyhow!("Failed to create openai client: {}", e))?;
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        "anthropic" => {
            let client = rig::providers::anthropic::Client::new(api_key)
                .map_err(|e| anyhow::anyhow!("Failed to create anthropic client: {}", e))?;
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        "groq" => {
            let client = rig::providers::groq::Client::new(api_key)
                .map_err(|e| anyhow::anyhow!("Failed to create groq client: {}", e))?;
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        "mistral" => {
            let client = rig::providers::mistral::Client::new(api_key)
                .map_err(|e| anyhow::anyhow!("Failed to create mistral client: {}", e))?;
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        "cohere" => {
            let client = rig::providers::cohere::Client::new(api_key)
                .map_err(|e| anyhow::anyhow!("Failed to create cohere client: {}", e))?;
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        "gemini" => {
            let client = rig::providers::gemini::Client::new(api_key)
                .map_err(|e| anyhow::anyhow!("Failed to create gemini client: {}", e))?;
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        "deepseek" => {
            let client = rig::providers::deepseek::Client::new(api_key)
                .map_err(|e| anyhow::anyhow!("Failed to create deepseek client: {}", e))?;
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        "openrouter" => {
            let client = rig::providers::openrouter::Client::new(api_key)
                .map_err(|e| anyhow::anyhow!("Failed to create openrouter client: {}", e))?;
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        "perplexity" => {
            let client = rig::providers::perplexity::Client::new(api_key)
                .map_err(|e| anyhow::anyhow!("Failed to create perplexity client: {}", e))?;
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        "together" => {
            let client = rig::providers::together::Client::new(api_key)
                .map_err(|e| anyhow::anyhow!("Failed to create together client: {}", e))?;
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        "xai" => {
            let client = rig::providers::xai::Client::new(api_key)
                .map_err(|e| anyhow::anyhow!("Failed to create xai client: {}", e))?;
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        "ollama" => {
            let url = base_url.unwrap_or("http://localhost:11434");
            let client = rig::providers::ollama::Client::builder()
                .api_key(rig::client::Nothing)
                .base_url(url)
                .build()
                .map_err(|e| anyhow::anyhow!("Failed to create ollama client: {}", e))?;
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        "llamafile" => {
            let url = base_url.unwrap_or("http://localhost:8080");
            let client = rig::providers::llamafile::Client::from_url(url);
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        "openai_compatible" => {
            let url = base_url
                .filter(|s| !s.is_empty())
                .ok_or_else(|| anyhow::anyhow!("openai_compatible provider requires a Base URL"))?;
            let client = rig::providers::openai::CompletionsClient::builder()
                .api_key(api_key)
                .base_url(url)
                .build()
                .map_err(|e| anyhow::anyhow!("Failed to create openai_compatible client: {}", e))?;
            let response = build_agent!(client).prompt(prompt).await?;
            Ok(response)
        }
        _ => Err(anyhow::anyhow!("Unsupported AI provider: {}", provider)),
    }
}
