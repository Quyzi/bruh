use anyhow::Result;

pub mod config;
pub mod secrets;

pub use config::{Config, ConfigError};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

pub fn run(config: Config) -> Result<()> {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(config)
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    Ok(())
}
