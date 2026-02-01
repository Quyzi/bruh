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

// Workflow management
export async function saveWorkflow(workflow: unknown): Promise<void> {
  return invoke("save_workflow", { workflow });
}

export async function loadWorkflow(): Promise<unknown | null> {
  return invoke<unknown | null>("load_workflow");
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

// Executor (workflow runner) control
export type ExecutorState = "stopped" | "running";

export async function getExecutorState(): Promise<ExecutorState> {
  return invoke<ExecutorState>("get_executor_state");
}

export async function executorStart(): Promise<void> {
  return invoke("executor_start");
}

export async function executorStop(): Promise<void> {
  return invoke("executor_stop");
}
