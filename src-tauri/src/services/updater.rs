use crate::services::{DatabaseService, TimerService};
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;
#[cfg(target_os = "windows")]
use crate::models::TimerPhase;
#[cfg(target_os = "windows")]
use std::sync::OnceLock;
#[cfg(target_os = "windows")]
use tauri::Manager;

const RELEASE_API: &str = "https://api.github.com/repos/youtonghy/RESTY/releases/latest";
const USER_AGENT: &str = "RESTY-Updater";
#[cfg(target_os = "windows")]
const AUTO_UPDATE_POLL_INTERVAL_SECS: u64 = 30 * 60;
#[cfg(target_os = "windows")]
const AUTO_UPDATE_WAIT_INTERVAL_SECS: u64 = 30;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateManifest {
    pub name: Option<String>,
    pub version: String,
    pub author: Option<String>,
    pub website: Option<String>,
    pub download_url: Option<String>,
    pub notes: Option<String>,
    pub asset_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    assets: Vec<GithubAsset>,
    author: Option<GithubAuthor>,
}

#[derive(Debug, Deserialize, Clone)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GithubAuthor {
    login: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
enum InstallMode {
    Manual,
    AutoSilent,
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
impl InstallMode {
    fn silent(self) -> bool {
        matches!(self, Self::AutoSilent)
    }

    fn relaunch(self) -> bool {
        matches!(self, Self::AutoSilent)
    }
}

/// Fetch the latest GitHub release and return a platform-matching asset.
pub async fn fetch_latest_release() -> Result<Option<UpdateManifest>> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .context("Failed to build updater HTTP client")?;

    let response = client
        .get(RELEASE_API)
        .send()
        .await
        .context("Failed to request latest release")?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let release: GithubRelease = response
        .json()
        .await
        .context("Failed to parse latest release payload")?;

    let asset = pick_asset(&release.assets);
    let version = release.tag_name.trim_start_matches('v').to_string();

    Ok(Some(UpdateManifest {
        name: release
            .name
            .clone()
            .or_else(|| Some(format!("Release {}", version))),
        version,
        author: release.author.map(|a| a.login),
        website: Some(release.html_url),
        download_url: asset.as_ref().map(|a| a.browser_download_url.clone()),
        notes: release.body,
        asset_name: asset.map(|a| a.name),
    }))
}

/// Download the installer for the given URL and launch it.
pub async fn download_and_install(app: &AppHandle, url: &str) -> Result<PathBuf> {
    download_and_install_with_mode(app, url, InstallMode::Manual).await
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

async fn download_and_install_with_mode(app: &AppHandle, url: &str, mode: InstallMode) -> Result<PathBuf> {
    let target_path = download_installer(url).await?;
    launch_installer(app, &target_path, mode)?;
    Ok(target_path)
}

async fn download_installer(url: &str) -> Result<PathBuf> {
    let download_dir = std::env::temp_dir().join("resty-updates");
    tokio::fs::create_dir_all(&download_dir)
        .await
        .context("Failed to create temp download directory")?;

    let file_name = url
        .split('/')
        .next_back()
        .filter(|name| !name.is_empty())
        .unwrap_or("resty-installer.bin");
    let target_path = download_dir.join(file_name);

    download_file(url, &target_path).await?;
    Ok(target_path)
}

fn matches_arch(name: &str) -> bool {
    let lower = name.to_lowercase();
    match std::env::consts::ARCH {
        "x86_64" | "amd64" => {
            lower.contains("x86_64") || lower.contains("x64") || lower.contains("amd64")
        }
        "aarch64" => lower.contains("aarch64") || lower.contains("arm64"),
        _ => true,
    }
}

fn contains_disallowed_suffix(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(".sig")
        || lower.ends_with(".sha256")
        || lower.ends_with(".sha512")
        || lower.ends_with("checksums.txt")
}

fn matches_os_hint(name: &str) -> bool {
    let lower = name.to_lowercase();
    match std::env::consts::OS {
        "windows" => lower.contains("windows") || lower.contains("win"),
        "macos" => lower.contains("mac") || lower.contains("darwin") || lower.contains("osx"),
        _ => lower.contains("linux") || lower.contains("appimage") || lower.contains("deb"),
    }
}

fn pick_asset(assets: &[GithubAsset]) -> Option<GithubAsset> {
    let os = std::env::consts::OS;
    let prioritized_exts = match os {
        "windows" => vec![".exe", ".msi"],
        "macos" => vec![".dmg", ".pkg", ".zip"],
        _ => vec![".appimage", ".deb", ".tar.gz", ".tar.xz"],
    };

    let candidates: Vec<&GithubAsset> = assets
        .iter()
        .filter(|asset| !contains_disallowed_suffix(&asset.name))
        .collect();

    for ext in &prioritized_exts {
        if let Some(asset) = candidates.iter().find(|asset| {
            let lower = asset.name.to_lowercase();
            lower.ends_with(ext) && matches_arch(&asset.name) && matches_os_hint(&asset.name)
        }) {
            return Some((*asset).clone());
        }
    }

    for ext in &prioritized_exts {
        if let Some(asset) = candidates.iter().find(|asset| {
            let lower = asset.name.to_lowercase();
            lower.ends_with(ext) && matches_arch(&asset.name)
        }) {
            return Some((*asset).clone());
        }
    }

    candidates.first().map(|asset| (*asset).clone())
}

async fn download_file(url: &str, path: &Path) -> Result<()> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .context("Failed to build download client")?;

    let mut response = client
        .get(url)
        .send()
        .await
        .context("Failed to start update download")?;

    if !response.status().is_success() {
        return Err(anyhow!("Download failed with status {}", response.status()));
    }

    let mut file = tokio::fs::File::create(path)
        .await
        .context("Failed to create installer file")?;

    while let Some(chunk) = response.chunk().await? {
        file.write_all(&chunk)
            .await
            .context("Failed to write installer data")?;
    }

    Ok(())
}

fn launch_installer(app: &AppHandle, path: &Path, mode: InstallMode) -> Result<()> {
    let _ = app;
    #[cfg(windows)]
    {
        use std::process::Command;

        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();

        if ext == "msi" {
            let mut cmd = Command::new("msiexec");
            cmd.arg("/i").arg(path);
            if mode.silent() {
                cmd.arg("/qn").arg("/norestart");
            } else {
                cmd.arg("/passive").arg("/norestart");
            }
            cmd.spawn()
                .context("Failed to launch Windows MSI installer")?;
        } else {
            let mut cmd = Command::new(path);
            if mode.silent() {
                // NSIS installers honor /S, and /quiet /norestart are best-effort.
                cmd.arg("/S").arg("/quiet").arg("/norestart");
            }
            cmd.spawn()
                .context("Failed to launch Windows EXE installer")?;
        }

        if mode.relaunch() {
            schedule_windows_relaunch().context("Failed to schedule app relaunch")?;
        }

        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            handle.exit(0);
        });
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let _ = mode;
        Command::new("open")
            .arg(path)
            .spawn()
            .context("Failed to open macOS installer")?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        let _ = mode;

        let lower = path.to_string_lossy().to_ascii_lowercase();
        if lower.ends_with(".deb") {
            Command::new("xdg-open")
                .arg(path)
                .spawn()
                .context("Failed to open Linux deb package")?;
        } else if Command::new(path).spawn().is_err() {
            let _ = Command::new("chmod").arg("+x").arg(path).status();
            Command::new(path)
                .spawn()
                .context("Failed to start Linux installer")?;
        }
    }

    Ok(())
}

#[cfg(windows)]
fn schedule_windows_relaunch() -> Result<()> {
    use std::process::Command;

    let current_exe = std::env::current_exe().context("Failed to locate current executable")?;
    let script = format!(
        "timeout /T 8 /NOBREAK >NUL & start \"\" \"{}\"",
        current_exe.display()
    );
    Command::new("cmd")
        .arg("/C")
        .arg(script)
        .spawn()
        .context("Failed to run relaunch command")?;
    Ok(())
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

    let current_version = app.package_info().version.to_string();
    let Some(manifest) = fetch_latest_release().await? else {
        return Ok(());
    };

    if !is_newer_version(&manifest.version, &current_version) {
        return Ok(());
    }

    let url = manifest
        .download_url
        .as_deref()
        .ok_or_else(|| anyhow!("Missing download URL for auto update"))?;

    eprintln!(
        "[AutoUpdate] Found update {} -> {}",
        current_version, manifest.version
    );

    let target_path = download_installer(url).await?;

    if !wait_for_install_slot(app, timer_service, database_service).await? {
        return Ok(());
    }

    launch_installer(app, &target_path, InstallMode::AutoSilent)?;
    Ok(())
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

#[cfg(target_os = "windows")]
fn is_newer_version(candidate: &str, current: &str) -> bool {
    compare_version(candidate, current) > 0
}

#[cfg(target_os = "windows")]
fn compare_version(a: &str, b: &str) -> i32 {
    let parts_a = parse_version_parts(a);
    let parts_b = parse_version_parts(b);
    let max_len = parts_a.len().max(parts_b.len());

    for index in 0..max_len {
        let left = *parts_a.get(index).unwrap_or(&0);
        let right = *parts_b.get(index).unwrap_or(&0);
        if left > right {
            return 1;
        }
        if left < right {
            return -1;
        }
    }

    0
}

#[cfg(target_os = "windows")]
fn parse_version_parts(value: &str) -> Vec<i64> {
    value
        .trim_start_matches('v')
        .split('.')
        .map(|part| {
            let digits: String = part.chars().filter(|ch| ch.is_ascii_digit()).collect();
            digits.parse::<i64>().unwrap_or(0)
        })
        .collect()
}
