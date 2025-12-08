use crate::models::{
    AnalyticsData, AnalyticsQuery, MonitorInfo, Settings, SystemStatus, TimerInfo,
};
use crate::services::{DatabaseService, TimerService};
use crate::utils::AppError;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager, State};

/// Command 层共享的应用状态，封装计时服务与数据库服务句柄。
pub struct AppState {
    pub timer_service: Arc<TimerService>,
    pub database_service: Arc<tokio::sync::Mutex<DatabaseService>>,
    pub last_auto_close: Arc<std::sync::Mutex<Option<Instant>>>,
}

/// Load application settings
#[tauri::command]
pub async fn load_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let db = state.database_service.lock().await;
    db.load_settings().await.map_err(|e| e.to_string())
}

/// Save application settings
#[tauri::command]
pub async fn save_settings(
    mut settings: Settings,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if !settings.autostart && settings.silent_autostart {
        settings.silent_autostart = false;
    }
    // Validate settings
    validate_settings(&settings)?;

    // Update timer durations
    state.timer_service.update_timer_configuration(
        settings.work_duration,
        settings.break_duration,
        settings.segmented_work_enabled,
        settings.work_segments.clone(),
    );
    state
        .timer_service
        .update_flow_mode(settings.flow_mode_enabled)
        .map_err(|e| e.to_string())?;
    // Save to database
    let db = state.database_service.lock().await;
    db.save_settings(&settings).await.map_err(|e| e.to_string())
}

/// List audio files in the configured rest music directory.
#[tauri::command]
pub async fn get_rest_music_files(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let directory = {
        let db = state.database_service.lock().await;
        let settings = db.load_settings().await.map_err(|e| e.to_string())?;
        settings.rest_music_directory.clone()
    };

    let path = PathBuf::from(directory);
    if !path.exists() {
        return Ok(vec![]);
    }

    let mut files: Vec<String> = Vec::new();
    match std::fs::read_dir(&path) {
        Ok(entries) => {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_file() {
                    let is_supported = entry_path
                        .extension()
                        .and_then(|ext| ext.to_str())
                        .map(|ext| ext.to_ascii_lowercase())
                        .map(|ext| matches!(ext.as_str(), "mp3" | "wav" | "flac" | "ogg"))
                        .unwrap_or(false);
                    if is_supported {
                        files.push(entry_path.to_string_lossy().into_owned());
                    }
                }
            }
        }
        Err(err) => {
            eprintln!(
                "Failed to read rest music directory {}: {}",
                path.display(),
                err
            );
        }
    }

    files.sort();
    Ok(files)
}

/// Start work session
#[tauri::command]
pub fn start_work(state: State<'_, AppState>) -> Result<(), String> {
    state.timer_service.start_work().map_err(|e| e.to_string())
}

/// Start break session
#[tauri::command]
pub fn start_break(state: State<'_, AppState>) -> Result<(), String> {
    state.timer_service.start_break().map_err(|e| e.to_string())
}

/// Pause timer
#[tauri::command]
pub fn pause_timer(state: State<'_, AppState>) -> Result<(), String> {
    state.timer_service.pause().map_err(|e| e.to_string())
}

/// Resume timer
#[tauri::command]
pub fn resume_timer(state: State<'_, AppState>) -> Result<(), String> {
    state.timer_service.resume().map_err(|e| e.to_string())
}

/// Skip current phase
#[tauri::command]
pub async fn skip_phase(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let (session, should_show_reminder) = match state.timer_service.skip().map_err(|e| e.to_string())? {
        Some(v) => v,
        None => return Ok(()),
    };

    // Save session to database
    let db = state.database_service.lock().await;
    db.save_or_update_session(&session)
        .await
        .map_err(|e| e.to_string())?;

    // Trigger break reminder after the command completes
    if should_show_reminder {
        let _ = app.emit("show-break-reminder", ());
    }

    Ok(())
}

/// Extend current phase by 5 minutes
#[tauri::command]
pub fn extend_phase(state: State<'_, AppState>) -> Result<(), String> {
    state.timer_service.extend(5).map_err(|e| e.to_string())
}

/// Get current timer info
#[tauri::command]
pub fn get_timer_info(state: State<'_, AppState>) -> Result<TimerInfo, String> {
    Ok(state.timer_service.get_info())
}

/// Get analytics data for a date range
#[tauri::command]
pub async fn get_analytics(
    query: AnalyticsQuery,
    state: State<'_, AppState>,
) -> Result<AnalyticsData, String> {
    let db = state.database_service.lock().await;
    db.get_analytics(&query).await.map_err(|e| e.to_string())
}

/// Import configuration from JSON
#[tauri::command]
pub async fn import_config(
    json_str: String,
    state: State<'_, AppState>,
) -> Result<Settings, String> {
    let mut settings: Settings = serde_json::from_str(&json_str)
        .map_err(|e| AppError::ImportFailed(e.to_string()).to_string())?;

    if !settings.autostart && settings.silent_autostart {
        settings.silent_autostart = false;
    }

    validate_settings(&settings)?;

    state.timer_service.update_timer_configuration(
        settings.work_duration,
        settings.break_duration,
        settings.segmented_work_enabled,
        settings.work_segments.clone(),
    );
    state
        .timer_service
        .update_flow_mode(settings.flow_mode_enabled)
        .map_err(|e| e.to_string())?;

    let db = state.database_service.lock().await;
    db.save_settings(&settings)
        .await
        .map_err(|e| e.to_string())?;

    Ok(settings)
}

/// Export configuration to JSON
#[tauri::command]
pub async fn export_config(state: State<'_, AppState>) -> Result<String, String> {
    let db = state.database_service.lock().await;
    let settings = db.load_settings().await.map_err(|e| e.to_string())?;

    serde_json::to_string_pretty(&settings)
        .map_err(|e| AppError::ExportFailed(e.to_string()).to_string())
}

/// Get list of monitors
#[tauri::command]
pub fn get_monitors(_app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    // This is a placeholder implementation
    // In production, you would query actual monitor information
    Ok(vec![MonitorInfo {
        id: 0,
        name: "Primary Monitor".to_string(),
        width: 1920,
        height: 1080,
        is_primary: true,
    }])
}

/// Get system status (fullscreen, DND, etc.)
#[tauri::command]
pub fn get_system_status() -> Result<SystemStatus, String> {
    // This is a placeholder implementation
    // In production, you would check actual system status
    Ok(SystemStatus {
        is_fullscreen: false,
        is_do_not_disturb: false,
    })
}

/// Open reminder window
#[tauri::command]
pub fn open_reminder_window(app: AppHandle, fullscreen: bool) -> Result<(), String> {
    crate::show_break_reminder_window(&app, fullscreen).map_err(|e| e.to_string())
}

/// Show reminder window once frontend is ready
#[tauri::command]
pub fn show_reminder_window(app: AppHandle) -> Result<(), String> {
    // Show all reminder windows (across monitors)
    for (label, window) in app.webview_windows() {
        if label.starts_with("break-reminder") {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
    Ok(())
}

/// Close reminder window
#[tauri::command]
pub fn close_reminder_window(app: AppHandle) -> Result<(), String> {
    let mut to_close = vec![];
    for (label, window) in app.webview_windows() {
        if label.starts_with("break-reminder") {
            to_close.push(window);
        }
    }
    for w in to_close {
        let _ = w.close();
    }
    Ok(())
}

/// Show main window (used by frontend after initialization)
#[tauri::command]
pub fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(false);
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

/// Handle tray menu actions from custom menu window
#[tauri::command]
pub async fn tray_menu_action(
    action: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    match action.as_str() {
        "skip" => {
            if let Some((session, should_show_reminder)) =
                state.timer_service.skip().map_err(|e| e.to_string())?
            {
                let db_guard = state.database_service.lock().await;
                let _ = db_guard.save_or_update_session(&session).await;
                drop(db_guard);

                // Trigger break reminder after completing the skip operation
                if should_show_reminder {
                    let _ = app.emit("show-break-reminder", ());
                }
            }
        }
        "no_break_1h" => {
            state.timer_service.suppress_breaks_for_hours(1);
        }
        "no_break_2h" => {
            state.timer_service.suppress_breaks_for_hours(2);
        }
        "no_break_5h" => {
            state.timer_service.suppress_breaks_for_hours(5);
        }
        "no_break_tomorrow" => {
            state.timer_service.suppress_breaks_until_tomorrow_morning();
        }
        "settings" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_skip_taskbar(false);
                let _ = win.show();
                let _ = win.set_focus();
                let _ = win.unminimize();
            }
            let _ = app.emit("open-settings", ());
        }
        "quit" => {
            std::process::exit(0);
        }
        _ => {}
    }
    Ok(())
}

/// 校验设置合法性，防止写入异常值。
fn validate_settings(settings: &Settings) -> Result<(), String> {
    if settings.work_duration == 0 || settings.work_duration > 120 {
        return Err(AppError::InvalidDuration.to_string());
    }
    if settings.break_duration == 0 || settings.break_duration > 120 {
        return Err(AppError::InvalidDuration.to_string());
    }
    if settings.segmented_work_enabled {
        if settings.work_segments.is_empty() {
            return Err(AppError::InvalidWorkSegments.to_string());
        }
        for segment in &settings.work_segments {
            if segment.work_minutes == 0 || segment.work_minutes > 120 {
                return Err(AppError::InvalidDuration.to_string());
            }
            if segment.break_minutes == 0 || segment.break_minutes > 120 {
                return Err(AppError::InvalidDuration.to_string());
            }
            if segment.repeat == 0 || segment.repeat > 12 {
                return Err(AppError::InvalidWorkSegments.to_string());
            }
        }
    }
    if settings.opacity > 100 {
        return Err(AppError::InvalidOpacity.to_string());
    }
    Ok(())
}
