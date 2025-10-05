mod commands;
mod models;
mod services;
mod utils;

use commands::AppState;
use services::{DatabaseService, TimerService};
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize database service
            let db_service = Arc::new(tokio::sync::Mutex::new(
                DatabaseService::new(app_handle.clone())
            ));

            // Initialize database schema
            let db_clone = Arc::clone(&db_service);
            tauri::async_runtime::spawn(async move {
                if let Err(e) = db_clone.lock().await.initialize().await {
                    eprintln!("Failed to initialize database: {}", e);
                }
            });

            // Load settings and create timer service
            let db_clone = Arc::clone(&db_service);
            let timer_service = tauri::async_runtime::block_on(async move {
                let db = db_clone.lock().await;
                let settings = db.load_settings().await.unwrap_or_default();
                let timer = TimerService::new(
                    app_handle,
                    settings.work_duration,
                    settings.break_duration,
                );
                timer.clone().start_ticker();
                timer
            });

            // Set up application state
            app.manage(AppState {
                timer_service,
                database_service: db_service,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_settings,
            commands::save_settings,
            commands::start_work,
            commands::start_break,
            commands::pause_timer,
            commands::resume_timer,
            commands::skip_phase,
            commands::extend_phase,
            commands::get_timer_info,
            commands::get_analytics,
            commands::import_config,
            commands::export_config,
            commands::get_monitors,
            commands::get_system_status,
            commands::open_reminder_window,
            commands::close_reminder_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
