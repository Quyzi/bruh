import { invoke } from "@tauri-apps/api/core";

export interface SetupStatus {
  credentialsConfigured: boolean;
  userAuthorized: boolean;
  twitchUsername?: string;
}

export interface TestResult {
  success: boolean;
  message: string;
}

export interface AuthUrlResponse {
  url: string;
  csrfToken: string;
}

export interface TokenExchangeResult {
  success: boolean;
  message: string;
  username?: string;
}

export interface CommandError {
  message: string;
}

export async function getSetupStatus(): Promise<SetupStatus> {
  return invoke<SetupStatus>("get_setup_status");
}

export async function saveTwitchCredentials(
  clientId: string,
  clientSecret: string
): Promise<void> {
  return invoke("save_twitch_credentials", {
    clientId,
    clientSecret,
  });
}

export async function testTwitchCredentials(): Promise<TestResult> {
  return invoke<TestResult>("test_twitch_credentials");
}

export async function getTwitchAuthUrl(scopes: string[]): Promise<AuthUrlResponse> {
  return invoke<AuthUrlResponse>("get_twitch_auth_url", { scopes });
}

export async function exchangeTwitchCode(
  code: string,
  state: string,
  scopes: string[]
): Promise<TokenExchangeResult> {
  return invoke<TokenExchangeResult>("exchange_twitch_code", { code, state, scopes });
}

export async function validateTwitchToken(): Promise<TokenExchangeResult> {
  return invoke<TokenExchangeResult>("validate_twitch_token");
}

export async function logoutTwitch(): Promise<void> {
  return invoke("logout_twitch");
}

export async function saveTwitchScopes(scopes: string[]): Promise<void> {
  return invoke("save_twitch_scopes", { scopes });
}

export async function getTwitchScopes(): Promise<string[]> {
  return invoke<string[]>("get_twitch_scopes");
}

export interface RequiredChannelScopes {
  required: string[];
  recommendedForModerated: string[];
}

export async function getRequiredChannelScopes(): Promise<RequiredChannelScopes> {
  return invoke<RequiredChannelScopes>("get_required_channel_scopes");
}

// Secrets management
export async function listSecrets(): Promise<string[]> {
  return invoke<string[]>("list_secrets");
}

export async function getSecret(name: string): Promise<string> {
  return invoke<string>("get_secret", { name });
}

export async function setSecret(name: string, value: string): Promise<void> {
  return invoke("set_secret", { name, value });
}

export async function deleteSecret(name: string): Promise<void> {
  return invoke("delete_secret", { name });
}

// Channels management (channels.json)
export interface Channel {
  login: string;
  display_name?: string | null;
}

export interface ValidateChannelResult {
  valid: boolean;
  channelId?: string | null;
  displayName?: string | null;
  message: string;
}

export async function loadChannels(): Promise<Channel[]> {
  return invoke<Channel[]>("load_channels");
}

export async function saveChannels(channels: Channel[]): Promise<void> {
  return invoke("save_channels", { channels });
}

export async function validateChannel(login: string): Promise<ValidateChannelResult> {
  return invoke<ValidateChannelResult>("validate_channel", { login: login.trim() });
}

// Workflow management
export async function saveWorkflow(workflow: unknown): Promise<void> {
  return invoke("save_workflow", { workflow });
}

export async function loadWorkflow(): Promise<unknown | null> {
  return invoke<unknown | null>("load_workflow");
}

// Startup SQL (e.g. ~/.bruh/startup.sql) for database extensions and DDL
export async function readStartupSql(): Promise<string> {
  return invoke<string>("read_startup_sql");
}

export async function writeStartupSql(content: string): Promise<void> {
  return invoke("write_startup_sql", { content });
}

export async function runStartupSql(content: string): Promise<void> {
  return invoke("run_startup_sql", { content });
}

// Scripts management (uses config.scripts directory)
export async function listScripts(): Promise<string[]> {
  return invoke<string[]>("list_scripts");
}

export async function readScript(name: string): Promise<string> {
  return invoke<string>("read_script", { name });
}

export async function writeScript(name: string, content: string): Promise<void> {
  return invoke("write_script", { name, content });
}

export async function deleteScript(name: string): Promise<void> {
  return invoke("delete_script", { name });
}

export async function renameScript(oldName: string, newName: string): Promise<void> {
  return invoke("rename_script", { oldName, newName });
}

export async function executeScript(
  name: string,
  input: unknown
): Promise<unknown> {
  return invoke("execute_script", { name, input });
}

export async function testScript(
  name: string,
  input: unknown
): Promise<void> {
  return invoke("test_script", { name, input });
}

// Runtime (workflow runner) control
export type RuntimeState = "stopped" | "running";

export async function getRuntimeState(): Promise<RuntimeState> {
  return invoke<RuntimeState>("get_runtime_state");
}

export async function runtimeStart(): Promise<void> {
  return invoke("runtime_start");
}

export async function runtimeStop(): Promise<void> {
  return invoke("runtime_stop");
}

// Dashboard chat moderation (require moderator scopes and bot must be mod in channel)
export async function deleteChatMessage(
  broadcasterId: string,
  messageId: string
): Promise<void> {
  return invoke("delete_chat_message", {
    broadcaster_id: broadcasterId,
    message_id: messageId,
  });
}

export async function timeoutUser(
  broadcasterId: string,
  userId: string,
  durationSeconds: number
): Promise<void> {
  return invoke("timeout_user", {
    broadcaster_id: broadcasterId,
    user_id: userId,
    duration_seconds: durationSeconds,
  });
}

export async function banUser(
  broadcasterId: string,
  userId: string,
  reason?: string
): Promise<void> {
  return invoke("ban_user", {
    broadcaster_id: broadcasterId,
    user_id: userId,
    reason,
  });
}

// Metrics (Prometheus exposition format as lines)
export async function renderMetrics(): Promise<string[]> {
  return invoke<string[]>("render_metrics");
}

// Git revision management (~/.bruh directory)
export interface CommitInfo {
  hash: string;
  fullHash: string;
  message: string;
  timestamp: number;
  isHead: boolean;
}

export interface GitStatusResult {
  initialized: boolean;
  dirty: boolean;
  commits: CommitInfo[];
}

export async function gitGetStatus(): Promise<GitStatusResult> {
  return invoke<GitStatusResult>("git_get_status");
}

export async function gitCommit(message: string): Promise<void> {
  return invoke("git_commit", { message });
}

export async function gitReset(): Promise<void> {
  return invoke("git_reset");
}

export async function gitCheckoutRevision(hash: string): Promise<void> {
  return invoke("git_checkout_revision", { hash });
}

// AI Agents management
export interface AiAgent {
  name: string;
  provider: string;
  model: string;
  max_tokens: number;
  temperature?: number;
  preamble?: string;
  base_url?: string;
}

export async function listAiAgents(): Promise<AiAgent[]> {
  return invoke<AiAgent[]>("list_ai_agents");
}

export async function setAiAgent(agent: AiAgent): Promise<void> {
  return invoke("set_ai_agent", { agent });
}

export async function deleteAiAgent(name: string): Promise<void> {
  return invoke("delete_ai_agent", { name });
}

export async function testAiAgent(name: string, prompt: string): Promise<string> {
  return invoke<string>("test_ai_agent", { name, prompt });
}
