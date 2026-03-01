#[tauri::command]
async fn fetch_url(url: String) -> Result<String, String> {
    reqwest::get(&url)
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())
}

use std::fs;
use std::path::PathBuf;
use serde_json::{Map, Value};
use tauri::Manager;

fn creds_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("credentials.json"))
        .map_err(|e| e.to_string())
}

fn read_creds(path: &PathBuf) -> Map<String, Value> {
    if !path.exists() {
        return Map::new();
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_creds(path: &PathBuf, map: &Map<String, Value>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(map).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn keychain_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let path = creds_path(&app)?;
    let map = read_creds(&path);
    Ok(map.get(&key).and_then(|v| v.as_str()).map(|s| s.to_owned()))
}

#[tauri::command]
fn keychain_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let path = creds_path(&app)?;
    let mut map = read_creds(&path);
    map.insert(key, Value::String(value));
    write_creds(&path, &map)
}

#[tauri::command]
fn keychain_delete(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let path = creds_path(&app)?;
    let mut map = read_creds(&path);
    map.remove(&key);
    write_creds(&path, &map)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![fetch_url, keychain_get, keychain_set, keychain_delete])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
