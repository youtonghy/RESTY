use crate::services::{DatabaseService, TimerService};
use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use std::sync::Arc;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;
#[cfg(target_os = "windows")]
use crate::models::TimerPhase;
#[cfg(target_os = "windows")]
use std::sync::OnceLock;
#[cfg(target_os = "windows")]
use tauri::Manager;

const RELEASES_PAGE_URL: &str = "https://github.com/youtonghy/RESTY/releases";
#[cfg(target_os = "windows")]
const AUTO_UPDATE_POLL_INTERVAL_SECS: u64 = 30 * 60;
#[cfg(target_os = "windows")]
const AUTO_UPDATE_WAIT_INTERVAL_SECS: u64 = 30;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateManifest {
    pub version: String,
    pub website: Option<String>,
    pub notes: Option<String>,
}

/// Returns true if the running build is a development build (e.g. version "0.0.0-dev").
/// Development builds only check for updates but never auto-download or install them.
pub fn is_dev_build(app: &AppHandle) -> bool {
    let version = app.package_info().version.to_string();
    version.starts_with("0.0.0") || version.contains("-dev")
}

pub async fn check_for_updates(app: &AppHandle) -> Result<Option<UpdateManifest>> {
    let Some(update) = app.updater().context("Failed to create updater")?.check().await? else {
        return Ok(None);
    };

    Ok(Some(UpdateManifest {
        version: update.version.to_string(),
        website: Some(RELEASES_PAGE_URL.to_string()),
        notes: normalize_notes(update.body),
    }))
}

pub async fn install_update(app: &AppHandle) -> Result<()> {
    if is_dev_build(app) {
        return Err(anyhow!(
            "Development builds do not install updates; please use an official release."
        ));
    }

    let Some(update) = app.updater().context("Failed to create updater")?.check().await? else {
        return Err(anyhow!("No update available"));
    };

    let target_version = update.version.to_string();
    update
        .download_and_install(
            |chunk_length, content_length| {
                eprintln!(
                    "[Updater] Downloaded {} bytes of {:?} for {}",
                    chunk_length, content_length, target_version
                );
            },
            || {
                eprintln!("[Updater] Finished downloading {}", target_version);
            },
        )
        .await
        .with_context(|| format!("Failed to install update {}", target_version))?;

    app.restart();
}

#[cfg(target_os = "windows")]
pub fn start_windows_auto_updater(
    app: AppHandle,
    timer_service: Arc<TimerService>,
    database_service: Arc<tokio::sync::Mutex<DatabaseService>>,
) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(
            AUTO_UPDATE_POLL_INTERVAL_SECS,
        ));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            ticker.tick().await;
            if let Err(err) = try_auto_update_once(&app, &timer_service, &database_service).await {
                eprintln!("[AutoUpdate] {}", err);
            }
        }
    });
}

#[cfg(not(target_os = "windows"))]
pub fn start_windows_auto_updater(
    _app: AppHandle,
    _timer_service: Arc<TimerService>,
    _database_service: Arc<tokio::sync::Mutex<DatabaseService>>,
) {
}

#[cfg(target_os = "windows")]
fn auto_update_lock() -> &'static tokio::sync::Mutex<()> {
    static AUTO_UPDATE_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
    AUTO_UPDATE_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

#[cfg(target_os = "windows")]
async fn try_auto_update_once(
    app: &AppHandle,
    timer_service: &Arc<TimerService>,
    database_service: &Arc<tokio::sync::Mutex<DatabaseService>>,
) -> Result<()> {
    let _guard = match auto_update_lock().try_lock() {
        Ok(guard) => guard,
        Err(_) => return Ok(()),
    };

    if !is_auto_update_enabled(database_service).await? {
        return Ok(());
    }

    if is_dev_build(app) {
        // Dev builds only check availability; they never download or install.
        if let Some(update) = app.updater().context("Failed to create updater")?.check().await? {
            eprintln!(
                "[AutoUpdate] Dev build {} detected update {}, skipping download.",
                app.package_info().version,
                update.version
            );
        }
        return Ok(());
    }

    let Some(update) = app.updater().context("Failed to create updater")?.check().await? else {
        return Ok(());
    };

    eprintln!(
        "[AutoUpdate] Found update {} -> {}",
        app.package_info().version,
        update.version
    );

    if !wait_for_install_slot(app, timer_service, database_service).await? {
        return Ok(());
    }

    let target_version = update.version.to_string();
    update
        .download_and_install(
            |chunk_length, content_length| {
                eprintln!(
                    "[AutoUpdate] Downloaded {} bytes of {:?} for {}",
                    chunk_length, content_length, target_version
                );
            },
            || {
                eprintln!("[AutoUpdate] Finished downloading {}", target_version);
            },
        )
        .await
        .with_context(|| format!("Failed to install update {}", target_version))?;

    app.restart();
}

#[cfg(target_os = "windows")]
async fn is_auto_update_enabled(
    database_service: &Arc<tokio::sync::Mutex<DatabaseService>>,
) -> Result<bool> {
    let settings = {
        let db = database_service.lock().await;
        db.load_settings()
            .await
            .map_err(|e| anyhow!("Failed to load settings: {}", e))?
    };
    Ok(settings.auto_silent_update_enabled)
}

#[cfg(target_os = "windows")]
async fn wait_for_install_slot(
    app: &AppHandle,
    timer_service: &Arc<TimerService>,
    database_service: &Arc<tokio::sync::Mutex<DatabaseService>>,
) -> Result<bool> {
    loop {
        if !is_auto_update_enabled(database_service).await? {
            return Ok(false);
        }

        if can_install_now(app, timer_service) {
            return Ok(true);
        }

        tokio::time::sleep(std::time::Duration::from_secs(
            AUTO_UPDATE_WAIT_INTERVAL_SECS,
        ))
        .await;
    }
}

#[cfg(target_os = "windows")]
fn can_install_now(app: &AppHandle, timer_service: &Arc<TimerService>) -> bool {
    let timer_info = timer_service.get_info();
    let is_timer_idle = timer_info.phase == TimerPhase::Idle;

    let main_window_hidden = app
        .get_webview_window("main")
        .map(|window| {
            window.is_minimized().unwrap_or(false) || !window.is_visible().unwrap_or(true)
        })
        .unwrap_or(false);

    let no_fullscreen_window = app
        .webview_windows()
        .values()
        .all(|window| !window.is_fullscreen().unwrap_or(false));

    (is_timer_idle || main_window_hidden) && no_fullscreen_window
}

fn normalize_notes(notes: Option<String>) -> Option<String> {
    notes.and_then(|body| {
        let trimmed = body.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}
