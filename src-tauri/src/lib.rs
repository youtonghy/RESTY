mod commands;
mod models;
mod services;
mod utils;

use crate::models::{FloatingPosition, Theme as SettingsTheme};
use commands::AppState;
use dark_light::Mode as SystemTheme;
use services::{DatabaseService, TimerService};
use std::sync::Arc;
use tauri::image::Image;
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{Emitter, Listener, Manager, Theme, WebviewUrl, WebviewWindowBuilder};

const TRAY_ICON_LIGHT: &[u8] = include_bytes!("../icons/128x128.png");
const TRAY_ICON_DARK: &[u8] = include_bytes!("../icons/128x128Night.png");
const MAIN_TRAY_ID: &str = "resty-main-tray";
#[cfg(target_os = "windows")]
const TRAY_MENU_WIDTH: f64 = 240.0;
#[cfg(target_os = "windows")]
const TRAY_MENU_HEIGHT: f64 = 192.0;
const FLOATING_MARGIN_X: i32 = 20;
const FLOATING_MARGIN_Y: i32 = 96;

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

/// Shared handler for tray actions used by both native menus and the custom window.
pub(crate) async fn handle_tray_action(
    action: &str,
    app: tauri::AppHandle,
    state: AppState,
) -> Result<(), String> {
    match action {
        "skip" => {
            if let Some((session, should_show_reminder)) =
                state.timer_service.skip().map_err(|e| e.to_string())?
            {
                let db_guard = state.database_service.lock().await;
                let _ = db_guard.save_or_update_session(&session).await;
                drop(db_guard);

                if should_show_reminder {
                    let _ = app.emit("show-break-reminder", ());
                }
            }
        }
        "no_break_1h" => state.timer_service.suppress_breaks_for_hours(1),
        "no_break_2h" => state.timer_service.suppress_breaks_for_hours(2),
        "no_break_5h" => state.timer_service.suppress_breaks_for_hours(5),
        "no_break_tomorrow" => state.timer_service.suppress_breaks_until_tomorrow_morning(),
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

/// Show custom tray menu window at the specified position
#[cfg(target_os = "windows")]
fn show_tray_menu_window(app: &tauri::AppHandle, x: f64, y: f64) {
    let window = app.get_webview_window("tray-menu");

    // Get screen dimensions and scale factor
    let (screen_width, screen_height, scale_factor) = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| {
            let size = m.size();
            let scale = m.scale_factor();
            (
                size.width as f64 / scale,
                size.height as f64 / scale,
                scale,
            )
        })
        .unwrap_or((1920.0, 1080.0, 1.0));

    // Convert physical cursor coordinates to logical
    let logical_x = x / scale_factor;
    let logical_y = y / scale_factor;

    // Smart position calculation (in Logical space):
    let mut menu_x = logical_x;
    let mut menu_y = logical_y - TRAY_MENU_HEIGHT - 8.0;

    // Horizontal adjustment
    if menu_x + TRAY_MENU_WIDTH > screen_width {
        menu_x = screen_width - TRAY_MENU_WIDTH - 8.0;
    }
    if menu_x < 0.0 {
        menu_x = 8.0;
    }

    // Vertical adjustment
    if menu_y < 0.0 {
        menu_y = logical_y + 8.0;
    }
    if menu_y + TRAY_MENU_HEIGHT > screen_height {
        menu_y = screen_height - TRAY_MENU_HEIGHT - 8.0;
    }

    let position = tauri::Position::Logical(tauri::LogicalPosition {
        x: menu_x,
        y: menu_y,
    });

    if let Some(w) = window {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.set_position(position);
            let _ = w.show();
            let _ = w.set_focus();
        }
    } else {
        let mut window_builder = WebviewWindowBuilder::new(
            app,
            "tray-menu",
            WebviewUrl::App("index.html#tray-menu".into()),
        )
        .title("")
        .inner_size(TRAY_MENU_WIDTH, TRAY_MENU_HEIGHT)
        .position(menu_x, menu_y)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(true)
            .visible(true);

        #[cfg(target_os = "windows")]
        {
            window_builder = window_builder.transparent(true);
        }

        let window = window_builder.build();

        match window {
            Ok(w) => {
                let _ = w.set_focus();
            }
            Err(e) => eprintln!("Failed to create tray menu window: {}", e),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// 构建并运行 Tauri 应用，初始化数据库、计时服务与事件监听。
pub fn run() {
    std::panic::set_hook(Box::new(|info| {
        let msg = match info.payload().downcast_ref::<&str>() {
            Some(s) => *s,
            None => match info.payload().downcast_ref::<String>() {
                Some(s) => &s[..],
                None => "Box<Any>",
            },
        };
        let location = info.location().map(|l| l.to_string()).unwrap_or_else(|| "unknown".to_string());
        let log = format!("Panic occurred at {}: {}", location, msg);
        eprintln!("{}", log);
        let _ = std::fs::write("panic.log", log);
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart".into()]),
        ))
        .on_window_event(move |window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // Only affect the main window
                    if window.label() == "main" {
                        api.prevent_close();
                        // Hide window and keep app running in tray
                        let _ = window.hide();
                        let _ = window.set_skip_taskbar(true);
                    }
                }
                tauri::WindowEvent::Focused(focused) => {
                    // Hide tray menu when it loses focus
                    if !focused && window.label() == "tray-menu" {
                        let _ = window.hide();
                        // Record close time to prevent immediate reopen on tray click
                        {
                            let state = window.state::<AppState>();
                            let last_auto_close = state.last_auto_close.clone();
                            if let Ok(mut last) = last_auto_close.lock() {
                                *last = Some(std::time::Instant::now());
                            };
                        }
                    }
                }
                _ => {}
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
            let last_auto_close = Arc::new(std::sync::Mutex::new(None));

            app.manage(AppState {
                timer_service,
                database_service: db_clone_for_state,
                last_auto_close,
            });

            // Determine if this is a silent autostart launch
            let launched_from_autostart = std::env::args().any(|arg| arg == "--autostart");
            let is_silent_autostart = launched_from_autostart
                && initial_settings.autostart
                && initial_settings.silent_autostart;

            // Window is now invisible by default (visible: false in tauri.conf.json)
            // Only show window if NOT silent autostart
            if let Some(main_window) = app.get_webview_window("main") {
                if is_silent_autostart {
                    // Keep window hidden and skip taskbar for silent autostart
                    let _ = main_window.set_skip_taskbar(true);
                } else {
                    // Normal launch: show window after setup is complete
                    let _ = main_window.show();
                    let _ = main_window.set_focus();
                }
            }

            // Listen for break reminder event
            let app_handle = app.handle().clone();
            let db_clone = Arc::clone(&db_service);
            app.listen("show-break-reminder", move |_event| {
                let app = app_handle.clone();
                let db = db_clone.clone();
                tauri::async_runtime::spawn(async move {
                    // Small delay to ensure tray menu is closed and resources are freed
                    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

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
                    let floating_position = settings.floating_position.clone();

                    if let Err(e) =
                        show_break_reminder_window(&app, is_fullscreen, floating_position)
                    {
                        eprintln!("Failed to show break reminder: {}", e);
                    }
                });
            });

            // Create system tray
            #[cfg(not(target_os = "windows"))]
            {
                use tauri::menu::{MenuBuilder, MenuItemBuilder};
                use tauri::tray::TrayIconEvent;

                let menu = MenuBuilder::new(app)
                    .item(
                        &MenuItemBuilder::with_id("skip", "跳到下一次休息/工作").build(app)?,
                    )
                    .item(
                        &MenuItemBuilder::with_id("no_break_1h", "1 小时不休息").build(app)?,
                    )
                    .item(
                        &MenuItemBuilder::with_id("no_break_2h", "2 小时不休息").build(app)?,
                    )
                    .item(
                        &MenuItemBuilder::with_id("no_break_5h", "5 小时不休息").build(app)?,
                    )
                    .item(
                        &MenuItemBuilder::with_id("no_break_tomorrow", "直到明天早晨")
                            .build(app)?,
                    )
                    .separator()
                    .item(&MenuItemBuilder::with_id("settings", "设置").build(app)?)
                    .item(&MenuItemBuilder::with_id("quit", "关闭").build(app)?)
                    .build()?;

                let mut tray_builder = TrayIconBuilder::with_id(MAIN_TRAY_ID)
                    .menu(&menu)
                    .on_menu_event(|app, event| {
                        let app = app.clone();
                        let action = event.id().as_ref().to_string();
                        let state = app.state::<AppState>();
                        let cloned_state = AppState {
                            timer_service: state.timer_service.clone(),
                            database_service: state.database_service.clone(),
                            last_auto_close: state.last_auto_close.clone(),
                        };

                        tauri::async_runtime::spawn(async move {
                            let _ = handle_tray_action(&action, app, cloned_state).await;
                        });
                    })
                    .on_tray_icon_event(|tray, event| match event {
                        TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        } => {
                            if let Some(win) = tray.app_handle().get_webview_window("main") {
                                let _ = win.set_skip_taskbar(false);
                                let _ = win.show();
                                let _ = win.unminimize();
                                let _ = win.set_focus();
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

            #[cfg(target_os = "windows")]
            {
                // Build tray icon without menu, use custom window
                let mut tray_builder = TrayIconBuilder::with_id(MAIN_TRAY_ID)
                    .show_menu_on_left_click(false)
                    .on_tray_icon_event(|tray, event| match event {
                        tauri::tray::TrayIconEvent::Click {
                            button,
                            button_state,
                            position,
                            ..
                        } => {
                            // Only handle button release to avoid double triggers
                            if button_state != tauri::tray::MouseButtonState::Up {
                                return;
                            }

                            let app = tray.app_handle();
                            match button {
                                tauri::tray::MouseButton::Left => {
                                    // Close tray menu if open
                                    if let Some(menu_win) = app.get_webview_window("tray-menu") {
                                        let _ = menu_win.close();
                                    }
                                    if let Some(win) = app.get_webview_window("main") {
                                        let _ = win.set_skip_taskbar(false);
                                        let _ = win.show();
                                        let _ = win.unminimize();
                                        let _ = win.set_focus();
                                    }
                                }
                                tauri::tray::MouseButton::Right => {
                                    // Check if we just closed the menu (debounce)
                                    let state = app.state::<AppState>();
                                    let should_open = if let Ok(last) = state.last_auto_close.lock() {
                                        if let Some(time) = *last {
                                            time.elapsed().as_millis() > 200
                                        } else {
                                            true
                                        }
                                    } else {
                                        true
                                    };

                                    if should_open {
                                        show_tray_menu_window(app, position.x, position.y);
                                    }
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
            commands::show_main_window,
            commands::tray_menu_action,
            commands::get_rest_music_files,
            commands::check_for_updates,
            commands::download_and_install_update,
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

fn resolve_floating_position(
    origin: tauri::PhysicalPosition<i32>,
    screen: tauri::PhysicalSize<u32>,
    window_size: tauri::PhysicalSize<u32>,
    floating_position: FloatingPosition,
) -> tauri::PhysicalPosition<i32> {
    let screen_width = screen.width as i32;
    let screen_height = screen.height as i32;
    let window_width = window_size.width as i32;
    let window_height = window_size.height as i32;

    let left = origin.x + FLOATING_MARGIN_X;
    let right = origin.x + screen_width - window_width - FLOATING_MARGIN_X;
    let top = origin.y + FLOATING_MARGIN_Y;
    let bottom = origin.y + screen_height - window_height - FLOATING_MARGIN_Y;

    let x = match floating_position {
        FloatingPosition::TopLeft | FloatingPosition::BottomLeft => left,
        FloatingPosition::TopRight | FloatingPosition::BottomRight => right,
    };
    let y = match floating_position {
        FloatingPosition::TopLeft | FloatingPosition::TopRight => top,
        FloatingPosition::BottomLeft | FloatingPosition::BottomRight => bottom,
    };

    let max_x = origin.x + (screen_width - window_width).max(0);
    let max_y = origin.y + (screen_height - window_height).max(0);

    tauri::PhysicalPosition {
        x: x.clamp(origin.x, max_x),
        y: y.clamp(origin.y, max_y),
    }
}

/// 根据配置显示休息提醒窗口（全屏或浮窗）。
pub fn show_break_reminder_window(
    app: &tauri::AppHandle,
    is_fullscreen: bool,
    floating_position: FloatingPosition,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("show_break_reminder_window: called, fullscreen={}", is_fullscreen);
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

            if let Ok(Some(monitor)) = window.current_monitor() {
                let screen = *monitor.size();
                let origin = *monitor.position();
                let window_size = window.outer_size()?;
                let position =
                    resolve_floating_position(origin, screen, window_size, floating_position);
                window.set_position(tauri::Position::Physical(position))?;
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
            let screen = *monitor.size();
            let win_size = window.outer_size()?;
            let position =
                resolve_floating_position(origin, screen, win_size, floating_position.clone());
            let _ = window.set_position(tauri::Position::Physical(position));
        }
    }

    Ok(())
}
