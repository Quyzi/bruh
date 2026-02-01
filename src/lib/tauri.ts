import { invoke } from "@tauri-apps/api/core";

export interface SetupStatus {
  twitch_configured: boolean;
}

export interface TestResult {
  success: boolean;
  message: string;
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
