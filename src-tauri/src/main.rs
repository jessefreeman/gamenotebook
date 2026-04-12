#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

// Learn more about Tauri commands at https://tauri.app/v1/guides/features/command
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChannelUpdateManifest {
    version: String,
    date: Option<String>,
    body: String,
    manual_download_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChannelUpdateCheckResult {
    should_update: bool,
    current_version: String,
    manifest: Option<ChannelUpdateManifest>,
}

fn normalize_update_channel(channel: &str) -> Result<String, String> {
    let normalized = channel.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "stable" => Ok(normalized),
        "dev" => Ok(normalized),
        _ => Err("Invalid update channel. Use 'stable' or 'dev'.".to_string()),
    }
}

fn with_channel_target(channel: &str) -> String {
    let base_target =
        tauri::updater::target().unwrap_or_else(|| "unknown-x86_64".to_string());
    format!("{base_target}@{channel}")
}

fn manual_download_url() -> String {
    "https://github.com/jessefreeman/gamenotebook/releases".to_string()
}

async fn check_update_internal<R: Runtime>(
    app: AppHandle<R>,
    channel: &str,
) -> Result<tauri::updater::UpdateResponse<R>, String> {
    tauri::updater::builder(app)
        .skip_events()
        .target(with_channel_target(channel))
        .check()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn check_update_for_channel(
    app: tauri::AppHandle,
    channel: String,
) -> Result<ChannelUpdateCheckResult, String> {
    let channel = normalize_update_channel(&channel)?;
    let update = check_update_internal(app, &channel).await?;
    let current_version = update.current_version().to_string();

    if update.is_update_available() {
        let version = update.latest_version().to_string();
        let date = update.date().map(|value| value.to_string());
        let body = update.body().cloned().unwrap_or_default();
        return Ok(ChannelUpdateCheckResult {
            should_update: true,
            current_version,
            manifest: Some(ChannelUpdateManifest {
                manual_download_url: manual_download_url(),
                version,
                date,
                body,
            }),
        });
    }

    Ok(ChannelUpdateCheckResult {
        should_update: false,
        current_version,
        manifest: None,
    })
}

#[tauri::command]
async fn install_update_for_channel(app: tauri::AppHandle, channel: String) -> Result<(), String> {
    let channel = normalize_update_channel(&channel)?;
    let update = check_update_internal(app, &channel).await?;

    if !update.is_update_available() {
        return Ok(());
    }

    update
        .download_and_install()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn show_main_window(window: tauri::Window) {
    // Show main window
    window.get_window("main").unwrap().show().unwrap();
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            greet,
            show_main_window,
            check_update_for_channel,
            install_update_for_channel
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
