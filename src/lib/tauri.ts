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
