use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;

const RELEASE_API: &str = "https://api.github.com/repos/youtonghy/RESTY/releases/latest";
const USER_AGENT: &str = "RESTY-Updater";

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
    content_type: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubAuthor {
    login: String,
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

/// Download the installer for the given URL and launch it silently when possible.
pub async fn download_and_install(app: &AppHandle, url: &str) -> Result<PathBuf> {
    let download_dir = std::env::temp_dir().join("resty-updates");
    tokio::fs::create_dir_all(&download_dir)
        .await
        .context("Failed to create temp download directory")?;

    let file_name = url
        .split('/')
        .last()
        .filter(|name| !name.is_empty())
        .unwrap_or("resty-installer.bin");
    let target_path = download_dir.join(file_name);

    download_file(url, &target_path).await?;
    launch_installer(app, &target_path)?;

    Ok(target_path)
}

fn matches_arch(name: &str) -> bool {
    let lower = name.to_lowercase();
    match std::env::consts::ARCH {
        "x86_64" | "amd64" => lower.contains("x86_64") || lower.contains("x64") || lower.contains("amd64"),
        "aarch64" => lower.contains("aarch64") || lower.contains("arm64"),
        _ => true,
    }
}

fn pick_asset(assets: &[GithubAsset]) -> Option<GithubAsset> {
    let os = std::env::consts::OS;
    let prioritized_exts = match os {
        "windows" => vec![".msi", ".exe"],
        "macos" => vec![".dmg", ".pkg", ".zip"],
        _ => vec![".appimage", ".deb", ".tar.gz", ".tar.xz"],
    };

    for ext in prioritized_exts {
        if let Some(asset) = assets
            .iter()
            .find(|asset| asset.name.to_lowercase().ends_with(ext) && matches_arch(&asset.name))
        {
            return Some(asset.clone());
        }
    }

    assets.first().cloned()
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
        return Err(anyhow!(
            "Download failed with status {}",
            response.status()
        ));
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

fn launch_installer(app: &AppHandle, path: &Path) -> Result<()> {
    // Keep a reference to avoid unused warnings on non-Windows targets.
    let _ = app;
    #[cfg(windows)]
    {
        use std::process::Command;
        let mut cmd = Command::new(path);
        // NSIS installers honor /S for silent install; keep extra quiet flags best-effort.
        cmd.arg("/S").arg("/quiet").arg("/norestart");
        cmd.spawn()
            .context("Failed to launch Windows installer")?;

        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            handle.exit(0);
        });
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        // macOS packages rarely support silent install; open the image/pkg instead.
        Command::new("open")
            .arg(path)
            .spawn()
            .context("Failed to open macOS installer")?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;

        // Try running the artifact directly (AppImage) and fallback to making it executable.
        if Command::new(path).spawn().is_err() {
            let _ = Command::new("chmod").arg("+x").arg(path).status();
            Command::new(path)
                .spawn()
                .context("Failed to start Linux installer")?;
        }
    }

    Ok(())
}
