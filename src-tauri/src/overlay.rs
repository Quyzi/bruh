use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
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

fn get_css_path(app: &AppHandle) -> Result<PathBuf, CommandError> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| CommandError::new(e.to_string()))?;
    Ok(config_dir.join("overlay.css"))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TemplateInfo {
    pub name: String,
    pub path: String,
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
    .inner_size(1280.0, 720.0)
    .decorations(true)
    .always_on_top(true)
    .transparent(true)
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
pub fn save_template(app: AppHandle, name: String, content: String) -> Result<(), CommandError> {
    let templates_dir = get_templates_dir(&app)?;
    let template_path = templates_dir.join(format!("{}.html", name));

    if let Some(parent) = template_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| CommandError::new(format!("Failed to create directory: {}", e)))?;
        }
    }

    fs::write(&template_path, content)
        .map_err(|e| CommandError::new(format!("Failed to save template: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub fn load_template(app: AppHandle, name: String) -> Result<String, CommandError> {
    let templates_dir = get_templates_dir(&app)?;
    let template_path = templates_dir.join(format!("{}.html", name));

    if !template_path.exists() {
        return Err(CommandError::new(format!("Template '{}' not found", name)));
    }

    fs::read_to_string(&template_path)
        .map_err(|e| CommandError::new(format!("Failed to read template: {}", e)))
}

#[tauri::command]
pub fn list_templates(app: AppHandle) -> Result<Vec<TemplateInfo>, CommandError> {
    let templates_dir = get_templates_dir(&app)?;
    let mut templates = Vec::new();

    if let Ok(entries) = fs::read_dir(&templates_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "html") {
                if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                    templates.push(TemplateInfo {
                        name: name.to_string(),
                        path: path.to_string_lossy().to_string(),
                    });
                }
            }
        }
    }

    templates.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(templates)
}

#[tauri::command]
pub fn delete_template(app: AppHandle, name: String) -> Result<(), CommandError> {
    let templates_dir = get_templates_dir(&app)?;
    let template_path = templates_dir.join(format!("{}.html", name));

    if !template_path.exists() {
        return Err(CommandError::new(format!("Template '{}' not found", name)));
    }

    fs::remove_file(&template_path)
        .map_err(|e| CommandError::new(format!("Failed to delete template: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub fn save_css(app: AppHandle, content: String) -> Result<(), CommandError> {
    let css_path = get_css_path(&app)?;

    if let Some(parent) = css_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| CommandError::new(format!("Failed to create directory: {}", e)))?;
        }
    }

    fs::write(&css_path, content)
        .map_err(|e| CommandError::new(format!("Failed to save CSS: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub fn load_css(app: AppHandle) -> Result<String, CommandError> {
    let css_path = get_css_path(&app)?;

    if !css_path.exists() {
        return Ok(String::new());
    }

    fs::read_to_string(&css_path)
        .map_err(|e| CommandError::new(format!("Failed to read CSS: {}", e)))
}

#[tauri::command]
pub fn save_default_template(
    app: AppHandle,
    name: String,
    content: String,
) -> Result<(), CommandError> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| CommandError::new(e.to_string()))?;
    let defaults_dir = config_dir.join("templates").join("_defaults");

    if !defaults_dir.exists() {
        fs::create_dir_all(&defaults_dir)
            .map_err(|e| CommandError::new(format!("Failed to create defaults dir: {}", e)))?;
    }

    let template_path = defaults_dir.join(format!("{}.html", name));
    fs::write(&template_path, content)
        .map_err(|e| CommandError::new(format!("Failed to save default template: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub fn load_default_template(name: String) -> Result<String, CommandError> {
    let binding = std::env::current_exe().map_err(|e| CommandError::new(e.to_string()))?;
    let exe_dir = binding
        .parent()
        .ok_or_else(|| CommandError::new("Failed to get exe directory".to_string()))?;

    let template_path = exe_dir
        .join("resources")
        .join("templates")
        .join(format!("{}.html", name));

    if template_path.exists() {
        return fs::read_to_string(&template_path)
            .map_err(|e| CommandError::new(format!("Failed to read default template: {}", e)));
    }

    let bundled_path = exe_dir
        .join("..")
        .join("share")
        .join("bruh")
        .join("templates")
        .join(format!("{}.html", name));
    if bundled_path.exists() {
        return fs::read_to_string(&bundled_path)
            .map_err(|e| CommandError::new(format!("Failed to read bundled template: {}", e)));
    }

    Err(CommandError::new(format!(
        "Default template '{}' not found",
        name
    )))
}
