mod commands;
mod models;
mod services;
mod utils;

use commands::AppState;
use services::{DatabaseService, TimerService};
use std::sync::Arc;
use tauri::{Emitter, Listener, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::TrayIconBuilder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// 构建并运行 Tauri 应用，初始化数据库、计时服务与事件监听。
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Intercept main window close to minimize instead of exiting
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Only affect the main window
                if window.label() == "main" {
                    api.prevent_close();
                    // Minimize to taskbar instead of hiding
                    let _ = window.minimize();
                }
            }
        })
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize database service
            let db_service = Arc::new(tokio::sync::Mutex::new(DatabaseService::new(
                app_handle.clone(),
            )));

            // Initialize database schema before starting timer service
            let db_clone = Arc::clone(&db_service);
            if let Err(e) = tauri::async_runtime::block_on(async {
                let db = db_clone.lock().await;
                db.initialize().await
            }) {
                eprintln!("Failed to initialize database: {}", e);
            }

            // Load settings and create timer service
            let db_clone = Arc::clone(&db_service);
            let timer_service = tauri::async_runtime::block_on(async move {
                let db = db_clone.lock().await;
                let settings = db.load_settings().await.unwrap_or_default();
                let timer =
                    TimerService::new(app_handle, settings.work_duration, settings.break_duration);

                // Start the ticker
                timer.clone().start_ticker();

                // Auto-start work session when app launches
                let _ = timer.start_work();

                timer
            });

            // Set up application state
            let db_clone_for_state = Arc::clone(&db_service);
            app.manage(AppState {
                timer_service,
                database_service: db_clone_for_state,
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

                    let is_fullscreen = matches!(
                        settings.reminder_mode,
                        crate::models::ReminderMode::Fullscreen
                    );

                    if let Err(e) = show_break_reminder_window(&app, is_fullscreen) {
                        eprintln!("Failed to show break reminder: {}", e);
                    }
                });
            });

            // Create system tray with menu
            {
                // Build tray menu
                let skip_item = MenuItemBuilder::new("跳到下一次休息/工作").id("skip").build(app)?;
                // No-break submenu options
                let nb_1h = MenuItemBuilder::new("1 小时不休息").id("no_break_1h").build(app)?;
                let nb_2h = MenuItemBuilder::new("2 小时不休息").id("no_break_2h").build(app)?;
                let nb_5h = MenuItemBuilder::new("5 小时不休息").id("no_break_5h").build(app)?;
                let nb_tomorrow = MenuItemBuilder::new("直到明天早晨不休息").id("no_break_tomorrow").build(app)?;
                let no_break_submenu = SubmenuBuilder::new(app, "X 小时不休息")
                    .items(&[&nb_1h, &nb_2h, &nb_5h, &nb_tomorrow])
                    .build()?;
                let settings_item = MenuItemBuilder::new("设置").id("settings").build(app)?;
                let close_item = MenuItemBuilder::new("关闭").id("quit").build(app)?;
                let menu = MenuBuilder::new(app)
                    .items(&[&skip_item, &no_break_submenu, &settings_item, &close_item])
                    .build()?;

                // Build tray icon
                let mut tray_builder = TrayIconBuilder::new()
                    .menu(&menu)
                    .on_menu_event(|app, event| {
                        let id = event.id().as_ref();
                        match id {
                            "skip" => {
                                // Skip current phase and persist session
                                let state = app.state::<crate::commands::AppState>();
                                let timer = state.timer_service.clone();
                                let db = state.database_service.clone();
                                tauri::async_runtime::spawn(async move {
                                    match timer.skip() {
                                        Ok(session) => {
                                            if let Ok(mut guard) = db.try_lock() {
                                                let _ = guard.save_session(&session).await;
                                            } else {
                                                let db2 = db.lock().await;
                                                let _ = db2.save_session(&session).await;
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("Failed to skip phase from tray: {}", e);
                                        }
                                    }
                                });
                            }
                            "no_break_1h" => {
                                let state = app.state::<crate::commands::AppState>();
                                state.timer_service.suppress_breaks_for_hours(1);
                            }
                            "no_break_2h" => {
                                let state = app.state::<crate::commands::AppState>();
                                state.timer_service.suppress_breaks_for_hours(2);
                            }
                            "no_break_5h" => {
                                let state = app.state::<crate::commands::AppState>();
                                state.timer_service.suppress_breaks_for_hours(5);
                            }
                            "no_break_tomorrow" => {
                                let state = app.state::<crate::commands::AppState>();
                                state.timer_service.suppress_breaks_until_tomorrow_morning();
                            }
                            "settings" => {
                                if let Some(win) = app.get_webview_window("main") {
                                    let _ = win.show();
                                    let _ = win.set_focus();
                                    let _ = win.unminimize();
                                }
                                // Notify front-end to navigate to settings
                                let _ = app.emit("open-settings", ());
                            }
                            "quit" => {
                                std::process::exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        match event {
                            tauri::tray::TrayIconEvent::Click { button, .. } => {
                                let app = tray.app_handle();
                                match button {
                                    tauri::tray::MouseButton::Left => {
                                        if let Some(win) = app.get_webview_window("main") {
                                            // Always show and focus (no toggle) to avoid flicker
                                            let _ = win.show();
                                            let _ = win.unminimize();
                                            let _ = win.set_focus();
                                        }
                                    }
                                    tauri::tray::MouseButton::Right => {
                                        // No-op: let the OS show the attached menu.
                                    }
                                    _ => {}
                                }
                            }
                            _ => {}
                        }
                    })
                    .tooltip("RESTY");

                if let Some(icon) = app.default_window_icon().cloned() {
                    tray_builder = tray_builder.icon(icon);
                }

                let _tray = tray_builder.build(app)?;
            }

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

/// 根据配置显示休息提醒窗口（全屏或浮窗）。
pub fn show_break_reminder_window(
    app: &tauri::AppHandle,
    is_fullscreen: bool,
) -> Result<(), Box<dyn std::error::Error>> {
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
            WebviewUrl::App("index.html#reminder".into()),
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
            WebviewUrl::App("index.html#reminder".into()),
        )
        .title("Break Time - RESTY")
        .inner_size(340.0, 300.0)
        .resizable(false)
        .maximized(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()?;

        // Position at top-right corner
        if let Ok(monitor) = window.current_monitor() {
            if let Some(monitor) = monitor {
                let screen = monitor.size();
                let window_size = window.outer_size()?;
                let x = screen.width as i32 - window_size.width as i32 - 20;
                let y = 96; // move downward to avoid top-right system/UI controls
                window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))?;
            }
        }
    }

    Ok(())
}
