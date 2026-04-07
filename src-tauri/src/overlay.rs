use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::setup::CommandError;

const OVERLAY_WINDOW_LABEL: &str = "overlay";

fn get_templates_dir(app: &AppHandle) -> Result<PathBuf, CommandError> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| CommandError::new(e.to_string()))?;
    let templates_dir = config_dir.join("templates");
    if !templates_dir.exists() {
        fs::create_dir_all(&templates_dir)
            .map_err(|e| CommandError::new(format!("Failed to create templates dir: {}", e)))?;
    }
    Ok(templates_dir)
}


#[tauri::command]
pub async fn open_overlay_window(app: AppHandle) -> Result<(), CommandError> {
    if app.get_webview_window(OVERLAY_WINDOW_LABEL).is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        OVERLAY_WINDOW_LABEL,
        WebviewUrl::App("/overlay".into()),
    )
    .title("Bruh Overlay")
    .inner_size(500.0, 250.0)
    .decorations(true)
    .always_on_top(true)
    .transparent(true)
    .closable(false)
    .skip_taskbar(true)
    .resizable(true)
    .visible(true)
    .build()
    .map_err(|e| CommandError::new(format!("Failed to create overlay window: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub fn close_overlay_window(app: AppHandle) -> Result<(), CommandError> {
    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        window
            .close()
            .map_err(|e| CommandError::new(format!("Failed to close overlay window: {}", e)))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn toggle_overlay_window(app: AppHandle) -> Result<bool, CommandError> {
    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            window
                .hide()
                .map_err(|e| CommandError::new(e.to_string()))?;
            Ok(false)
        } else {
            window
                .show()
                .map_err(|e| CommandError::new(e.to_string()))?;
            window
                .set_focus()
                .map_err(|e| CommandError::new(e.to_string()))?;
            Ok(true)
        }
    } else {
        open_overlay_window(app.clone()).await?;
        Ok(true)
    }
}

#[tauri::command]
pub fn get_overlay_window_state(app: AppHandle) -> bool {
    app.get_webview_window(OVERLAY_WINDOW_LABEL)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

// --- Template commands ---

#[tauri::command]
pub fn list_overlay_templates(app: AppHandle) -> Result<Vec<String>, CommandError> {
    let templates_dir = get_templates_dir(&app)?;
    let mut names = Vec::new();

    if let Ok(entries) = fs::read_dir(&templates_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "html") {
                if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                    names.push(name.to_string());
                }
            }
        }
    }

    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn read_overlay_template(app: AppHandle, name: String) -> Result<String, CommandError> {
    let templates_dir = get_templates_dir(&app)?;
    let template_path = templates_dir.join(format!("{}.html", name));

    if !template_path.exists() {
        return Err(CommandError::new(format!("Template '{}' not found", name)));
    }

    fs::read_to_string(&template_path)
        .map_err(|e| CommandError::new(format!("Failed to read template: {}", e)))
}

#[tauri::command]
pub fn write_overlay_template(
    app: AppHandle,
    name: String,
    content: String,
) -> Result<(), CommandError> {
    let templates_dir = get_templates_dir(&app)?;
    let template_path = templates_dir.join(format!("{}.html", name));

    fs::write(&template_path, content)
        .map_err(|e| CommandError::new(format!("Failed to save template: {}", e)))
}

#[tauri::command]
pub fn delete_overlay_template(app: AppHandle, name: String) -> Result<(), CommandError> {
    let templates_dir = get_templates_dir(&app)?;
    let template_path = templates_dir.join(format!("{}.html", name));

    if !template_path.exists() {
        return Err(CommandError::new(format!("Template '{}' not found", name)));
    }

    fs::remove_file(&template_path)
        .map_err(|e| CommandError::new(format!("Failed to delete template: {}", e)))
}

#[tauri::command]
pub fn rename_overlay_template(
    app: AppHandle,
    old_name: String,
    new_name: String,
) -> Result<(), CommandError> {
    let templates_dir = get_templates_dir(&app)?;
    let old_path = templates_dir.join(format!("{}.html", old_name));
    let new_path = templates_dir.join(format!("{}.html", new_name));

    if !old_path.exists() {
        return Err(CommandError::new(format!(
            "Template '{}' not found",
            old_name
        )));
    }

    fs::rename(&old_path, &new_path)
        .map_err(|e| CommandError::new(format!("Failed to rename template: {}", e)))
}

