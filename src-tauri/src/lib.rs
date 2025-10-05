mod commands;
mod models;
mod services;
mod utils;

use commands::AppState;
use services::{DatabaseService, TimerService};
use std::sync::Arc;
use tauri::{Listener, Manager, WebviewUrl, WebviewWindowBuilder};

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

                // Start the ticker
                timer.clone().start_ticker();

                // Auto-start work session when app launches
                let _ = timer.start_work();

                timer
            });

            // Set up application state
            app.manage(AppState {
                timer_service,
                database_service: db_service,
            });

            // Listen for break reminder event
            let app_handle = app.handle().clone();
            let db_clone = Arc::clone(&db_service);
            app.listen("show-break-reminder", move |_event| {
                let app = app_handle.clone();
                let db = db_clone.clone();
                tauri::async_runtime::spawn(async move {
                    // Load settings to check reminder mode
                    let settings = match db.lock().await.load_settings().await {
                        Ok(s) => s,
                        Err(e) => {
                            eprintln!("Failed to load settings: {}", e);
                            return;
                        }
                    };

                    let is_fullscreen = matches!(settings.reminder_mode, crate::models::ReminderMode::Fullscreen);

                    if let Err(e) = show_break_reminder_window(&app, is_fullscreen) {
                        eprintln!("Failed to show break reminder: {}", e);
                    }
                });
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

/// Show break reminder window (fullscreen or floating)
fn show_break_reminder_window(app: &tauri::AppHandle, is_fullscreen: bool) -> Result<(), Box<dyn std::error::Error>> {
    // Check if window already exists
    if let Some(window) = app.get_webview_window("break-reminder") {
        window.set_focus()?;
        return Ok(());
    }

    if is_fullscreen {
        // Create fullscreen reminder window
        let window = WebviewWindowBuilder::new(
            app,
            "break-reminder",
            WebviewUrl::App("break-reminder.html".into())
        )
        .title("Break Time - RESTY")
        .fullscreen(true)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()?;

        window.set_focus()?;
    } else {
        // Create floating window at top-right corner
        let window = WebviewWindowBuilder::new(
            app,
            "break-reminder",
            WebviewUrl::App("break-reminder.html".into())
        )
        .title("Break Time - RESTY")
        .inner_size(400.0, 600.0)
        .resizable(false)
        .maximized(false)
        .decorations(true)
        .always_on_top(true)
        .skip_taskbar(false)
        .center()
        .build()?;

        // Position at top-right corner
        if let Ok(monitor) = window.current_monitor() {
            if let Some(monitor) = monitor {
                let screen = monitor.size();
                let window_size = window.outer_size()?;
                let x = screen.width as i32 - window_size.width as i32 - 20;
                let y = 20;
                window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))?;
            }
        }
    }

    Ok(())
}
