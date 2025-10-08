use crate::models::{
    AnalyticsData, AnalyticsQuery, MonitorInfo, Settings, SystemStatus, TimerInfo,
};
use crate::services::{DatabaseService, TimerService};
use crate::utils::AppError;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

/// Command 层共享的应用状态，封装计时服务与数据库服务句柄。
pub struct AppState {
    pub timer_service: Arc<TimerService>,
    pub database_service: Arc<tokio::sync::Mutex<DatabaseService>>,
}

/// Load application settings
#[tauri::command]
pub async fn load_settings(state: State<'_, AppState>) -> Result<Settings, String> {
    let db = state.database_service.lock().await;
    db.load_settings().await.map_err(|e| e.to_string())
}

/// Save application settings
#[tauri::command]
pub async fn save_settings(settings: Settings, state: State<'_, AppState>) -> Result<(), String> {
    // Validate settings
    validate_settings(&settings)?;

    // Update timer durations
    state
        .timer_service
        .update_durations(settings.work_duration, settings.break_duration);

    // Save to database
    let db = state.database_service.lock().await;
    db.save_settings(&settings).await.map_err(|e| e.to_string())
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
pub async fn skip_phase(state: State<'_, AppState>) -> Result<(), String> {
    let session = state.timer_service.skip().map_err(|e| e.to_string())?;

    // Save session to database
    let db = state.database_service.lock().await;
    db.save_or_update_session(&session)
        .await
        .map_err(|e| e.to_string())?;

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
    let settings: Settings = serde_json::from_str(&json_str)
        .map_err(|e| AppError::ImportFailed(e.to_string()).to_string())?;

    validate_settings(&settings)?;

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

/// 校验设置合法性，防止写入异常值。
fn validate_settings(settings: &Settings) -> Result<(), String> {
    if settings.work_duration == 0 || settings.work_duration > 120 {
        return Err(AppError::InvalidDuration.to_string());
    }
    if settings.break_duration == 0 || settings.break_duration > 120 {
        return Err(AppError::InvalidDuration.to_string());
    }
    if settings.opacity > 100 {
        return Err(AppError::InvalidOpacity.to_string());
    }
    Ok(())
}
