use anyhow::{anyhow, Context, Result};
use serde_json::Value;
use std::path::PathBuf;
use std::time::Duration;
use tauri::AppHandle;

const HITOKOTO_URL: &str = "https://v1.hitokoto.cn/?encode=json";
const VIEWBITS_URL: &str = "https://api.viewbits.com/v1/zenquotes?mode=random";
const QUOTE_USER_AGENT: &str = "RESTY-Quote";

fn normalize_quote(value: Option<&str>) -> Option<String> {
    let text = value?.trim();
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

fn extract_viewbits_quote(payload: &Value) -> Option<String> {
    if let Some(value) = payload.get("q").and_then(|item| item.as_str()) {
        return normalize_quote(Some(value));
    }
    if let Some(items) = payload.get("data").and_then(|item| item.as_array()) {
        if let Some(value) = items
            .get(0)
            .and_then(|item| item.get("q"))
            .and_then(|item| item.as_str())
        {
            return normalize_quote(Some(value));
        }
    }
    if let Some(items) = payload.as_array() {
        if let Some(value) = items
            .get(0)
            .and_then(|item| item.get("q"))
            .and_then(|item| item.as_str())
        {
            return normalize_quote(Some(value));
        }
    }
    None
}

fn resolve_local_asset_path(asset_path: &str) -> Option<PathBuf> {
    let cwd = std::env::current_dir().ok()?;
    let candidates = [
        cwd.join("public").join(asset_path),
        cwd.join("dist").join(asset_path),
        cwd.join("..").join("public").join(asset_path),
        cwd.join("..").join("dist").join(asset_path),
    ];
    candidates.into_iter().find(|path| path.exists())
}

async fn fetch_json(url: &str) -> Result<Value> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .user_agent(QUOTE_USER_AGENT)
        .build()
        .context("Failed to build quote HTTP client")?;
    let response = client
        .get(url)
        .send()
        .await
        .context("Failed to request quote API")?;

    if !response.status().is_success() {
        return Err(anyhow!("Quote API returned {}", response.status()));
    }

    response
        .json::<Value>()
        .await
        .context("Failed to parse quote payload")
}

pub async fn fetch_tip_quote(language: &str) -> Result<Option<String>> {
    let is_zh = language.to_lowercase().starts_with("zh");
    let payload = if is_zh {
        fetch_json(HITOKOTO_URL).await?
    } else {
        fetch_json(VIEWBITS_URL).await?
    };

    if is_zh {
        Ok(normalize_quote(payload.get("hitokoto").and_then(|item| item.as_str())))
    } else {
        Ok(extract_viewbits_quote(&payload))
    }
}

pub async fn load_translation(app: &AppHandle, language: &str) -> Result<Value> {
    let asset_path = format!("locales/{}/translation.json", language);
    if let Some(asset) = app.asset_resolver().get(asset_path.clone()) {
        let text = std::str::from_utf8(asset.bytes())
            .context("Failed to decode translation asset")?;
        let json = serde_json::from_str(text).context("Failed to parse translation asset")?;
        return Ok(json);
    }

    if let Some(path) = resolve_local_asset_path(&asset_path) {
        let bytes = tokio::fs::read(&path)
            .await
            .with_context(|| format!("Failed to read translation file {}", path.display()))?;
        let json = serde_json::from_slice(&bytes)
            .context("Failed to parse translation file")?;
        return Ok(json);
    }

    Err(anyhow!("Translation asset not found for {}", language))
}
