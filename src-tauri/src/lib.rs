mod commands;
mod models;
mod services;
mod utils;

use crate::models::Theme as SettingsTheme;
use commands::AppState;
use dark_light::Mode as SystemTheme;
use services::{DatabaseService, TimerService};
use std::sync::Arc;
use tauri::image::Image;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{Emitter, Listener, Manager, Theme, WebviewUrl, WebviewWindowBuilder};

const TRAY_ICON_LIGHT: &[u8] = include_bytes!("../icons/128x128.png");
const TRAY_ICON_DARK: &[u8] = include_bytes!("../icons/128x128Night.png");
const MAIN_TRAY_ID: &str = "resty-main-tray";

fn load_tray_image(bytes: &[u8]) -> Option<Image<'static>> {
    Image::from_bytes(bytes).ok()
}

fn apply_tray_theme_icon(tray: &TrayIcon, theme: Theme) {
    let icon_bytes = match theme {
        Theme::Dark => TRAY_ICON_DARK,
        _ => TRAY_ICON_LIGHT,
    };

    if let Some(image) = load_tray_image(icon_bytes) {
        if let Err(err) = tray.set_icon(Some(image)) {
            eprintln!("Failed to set tray icon for theme {:?}: {}", theme, err);
        }
    } else {
        eprintln!("Failed to decode tray icon for theme {:?}", theme);
    }
}

fn current_system_theme() -> Theme {
    match dark_light::detect() {
        SystemTheme::Dark => Theme::Dark,
        _ => Theme::Light,
    }
}

fn resolve_tray_theme(preference: &SettingsTheme) -> Theme {
    match preference {
        SettingsTheme::Dark => Theme::Dark,
        SettingsTheme::Light => Theme::Light,
        SettingsTheme::Auto => current_system_theme(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// 构建并运行 Tauri 应用，初始化数据库、计时服务与事件监听。
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart".into()]),
        ))
        // Intercept main window close to minimize instead of exiting
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Only affect the main window
                if window.label() == "main" {
                    api.prevent_close();
                    // Hide window and keep app running in tray
                    let _ = window.hide();
                    let _ = window.set_skip_taskbar(true);
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
            let (initial_settings, timer_service) = tauri::async_runtime::block_on(async move {
                let db = db_clone.lock().await;
                let settings = db.load_settings().await.unwrap_or_default();
                let timer = TimerService::new(
                    app_handle,
                    Arc::clone(&db_clone),
                    settings.work_duration,
                    settings.break_duration,
                    settings.flow_mode_enabled,
                    settings.segmented_work_enabled,
                    settings.work_segments.clone(),
                );

                // Start the ticker
                timer.clone().start_ticker();

                // Auto-start work session when app launches
                let _ = timer.start_work();

                // Begin monitoring display power state (Windows) to auto pause when screen turns off.
                crate::services::power::start_display_power_monitor(timer.clone());

                (settings, timer)
            });

            // Set up application state
            let db_clone_for_state = Arc::clone(&db_service);
            app.manage(AppState {
                timer_service,
                database_service: db_clone_for_state,
            });

            // Hide window when autostart launches in silent mode
            let launched_from_autostart = std::env::args().any(|arg| arg == "--autostart");
            if launched_from_autostart
                && initial_settings.autostart
                && initial_settings.silent_autostart
            {
                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.hide();
                    let _ = main_window.set_skip_taskbar(true);
                }
            }

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
                let skip_item = MenuItemBuilder::new("跳到下一次休息/工作")
                    .id("skip")
                    .build(app)?;
                // No-break submenu options
                let nb_1h = MenuItemBuilder::new("1 小时不休息")
                    .id("no_break_1h")
                    .build(app)?;
                let nb_2h = MenuItemBuilder::new("2 小时不休息")
                    .id("no_break_2h")
                    .build(app)?;
                let nb_5h = MenuItemBuilder::new("5 小时不休息")
                    .id("no_break_5h")
                    .build(app)?;
                let nb_tomorrow = MenuItemBuilder::new("直到明天早晨不休息")
                    .id("no_break_tomorrow")
                    .build(app)?;
                let no_break_submenu = SubmenuBuilder::new(app, "X 小时不休息")
                    .items(&[&nb_1h, &nb_2h, &nb_5h, &nb_tomorrow])
                    .build()?;
                let settings_item = MenuItemBuilder::new("设置").id("settings").build(app)?;
                let close_item = MenuItemBuilder::new("关闭").id("quit").build(app)?;
                let menu = MenuBuilder::new(app)
                    .items(&[&skip_item, &no_break_submenu, &settings_item, &close_item])
                    .build()?;

                // Build tray icon
                let mut tray_builder = TrayIconBuilder::with_id(MAIN_TRAY_ID)
                    .menu(&menu)
                    // Prevent showing context menu on left click to avoid flicker
                    .show_menu_on_left_click(false)
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
                                                let _ =
                                                    guard.save_or_update_session(&session).await;
                                            } else {
                                                let db2 = db.lock().await;
                                                let _ = db2.save_or_update_session(&session).await;
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
                                    let _ = win.set_skip_taskbar(false);
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
                    .on_tray_icon_event(|tray, event| match event {
                        tauri::tray::TrayIconEvent::Click { button, .. } => {
                            let app = tray.app_handle();
                            match button {
                                tauri::tray::MouseButton::Left => {
                                    if let Some(win) = app.get_webview_window("main") {
                                        // Always show and focus (no toggle) to avoid flicker
                                        let _ = win.set_skip_taskbar(false);
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
                    })
                    .tooltip("RESTY");

                if let Some(icon) =
                    load_tray_image(TRAY_ICON_LIGHT).or_else(|| app.default_window_icon().cloned())
                {
                    tray_builder = tray_builder.icon(icon);
                }

                let tray_icon = tray_builder.build(app)?;
                let initial_tray_theme = resolve_tray_theme(&initial_settings.theme);
                apply_tray_theme_icon(&tray_icon, initial_tray_theme);
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
            commands::show_reminder_window,
            commands::close_reminder_window,
            commands::get_rest_music_files,
            update_tray_icon_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn update_tray_icon_theme(app: tauri::AppHandle, theme: String) -> Result<(), String> {
    let desired = if theme.eq_ignore_ascii_case("dark") {
        Theme::Dark
    } else {
        Theme::Light
    };

    if let Some(tray) = app.tray_by_id(MAIN_TRAY_ID) {
        apply_tray_theme_icon(&tray, desired);
    } else {
        eprintln!("Tray icon not found when updating theme");
    }

    Ok(())
}

/// 根据配置显示休息提醒窗口（全屏或浮窗）。
pub fn show_break_reminder_window(
    app: &tauri::AppHandle,
    is_fullscreen: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    // If any reminder windows already exist, bring them to front
    let existing: Vec<_> = app
        .webview_windows()
        .iter()
        .filter_map(|(label, w)| {
            if label.starts_with("break-reminder") {
                Some(w.clone())
            } else {
                None
            }
        })
        .collect();
    if !existing.is_empty() {
        for w in existing {
            let _ = w.show();
            let _ = w.set_focus();
        }
        return Ok(());
    }

    // Try multi-monitor setup
    let monitors = app.available_monitors().unwrap_or_default();
    if monitors.is_empty() {
        // Fallback to single-window behavior (current monitor)
        if is_fullscreen {
            let _window = WebviewWindowBuilder::new(
                app,
                "break-reminder",
                WebviewUrl::App("index.html#reminder".into()),
            )
            .title("Break Time - RESTY")
            .visible(false)
            .fullscreen(true)
            .resizable(false)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .build()?;
        } else {
            let window = WebviewWindowBuilder::new(
                app,
                "break-reminder",
                WebviewUrl::App("index.html#reminder".into()),
            )
            .title("Break Time - RESTY")
            .visible(false)
            .inner_size(340.0, 300.0)
            .resizable(false)
            .maximized(false)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .build()?;

            if let Ok(monitor) = window.current_monitor() {
                if let Some(monitor) = monitor {
                    let screen = monitor.size();
                    let window_size = window.outer_size()?;
                    let x = screen.width as i32 - window_size.width as i32 - 20;
                    let y = 96;
                    window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                        x,
                        y,
                    }))?;
                }
            }
        }
        return Ok(());
    }

    // Create a window on each monitor
    for (idx, monitor) in monitors.iter().enumerate() {
        let label = format!("break-reminder-{}", idx);
        let mut builder =
            WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html#reminder".into()))
                .title("Break Time - RESTY")
                .visible(false)
                .resizable(false)
                .decorations(false)
                .always_on_top(true)
                .skip_taskbar(true);

        if !is_fullscreen {
            builder = builder.inner_size(340.0, 300.0).maximized(false);
        }

        let window = builder.build()?;

        let origin = *monitor.position();
        if is_fullscreen {
            // Place on target monitor and then make fullscreen
            let _ = window.set_position(tauri::Position::Physical(origin));
            let _ = window.set_fullscreen(true);
        } else {
            // Top-right of the monitor
            let screen = monitor.size();
            let win_size = window.outer_size()?;
            let x = origin.x + (screen.width as i32 - win_size.width as i32 - 20);
            let y = origin.y + 96;
            let _ =
                window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
        }
    }

    Ok(())
}
