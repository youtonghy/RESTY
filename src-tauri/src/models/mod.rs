use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 默认的休息音乐目录：位于用户家目录下的 `RESTY/rest-music`。
pub fn rest_music_directory_default() -> String {
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("RESTY")
        .join("rest-music")
        .to_string_lossy()
        .into_owned()
}

fn default_rest_music_enabled() -> bool {
    false
}

fn default_rest_music_directory() -> String {
    rest_music_directory_default()
}

fn default_flow_mode() -> bool {
    false
}

/// Theme preference
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    Auto,
}

/// Language preference
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Language {
    #[serde(rename = "en-US", alias = "en", alias = "en-us")]
    EnglishUnitedStates,
    #[serde(rename = "en-GB", alias = "en-gb")]
    EnglishUnitedKingdom,
    #[serde(rename = "zh-CN", alias = "zh", alias = "zh-cn")]
    ChineseSimplified,
    #[serde(rename = "zh-TW", alias = "zh-tw", alias = "zh-HK", alias = "zh-hk")]
    ChineseTraditional,
}

/// Reminder display mode
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ReminderMode {
    Fullscreen,
    Floating,
}

/// Floating window position
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum FloatingPosition {
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

/// Timer phase
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TimerPhase {
    Work,
    Break,
    Idle,
}

/// Timer state
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TimerState {
    Running,
    Paused,
    Stopped,
}

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    // Timer settings
    pub work_duration: u32,  // in minutes
    pub break_duration: u32, // in minutes
    pub enable_force_break: bool,
    #[serde(default = "default_flow_mode")]
    pub flow_mode_enabled: bool,

    // Reminder settings
    pub reminder_mode: ReminderMode,
    pub floating_position: FloatingPosition,
    pub opacity: u8, // 0-100
    pub play_sound: bool,
    #[serde(default = "default_rest_music_enabled")]
    pub rest_music_enabled: bool,
    #[serde(default = "default_rest_music_directory")]
    pub rest_music_directory: String,

    // Appearance
    pub theme: Theme,

    // System
    pub autostart: bool,
    pub minimize_to_tray: bool,
    pub close_to_tray: bool,

    // Language
    pub language: Language,

    // Metadata
    pub version: String,
    pub updated_at: DateTime<Utc>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            work_duration: 25,
            break_duration: 5,
            enable_force_break: false,
            flow_mode_enabled: default_flow_mode(),
            reminder_mode: ReminderMode::Fullscreen,
            floating_position: FloatingPosition::TopRight,
            opacity: 95,
            play_sound: true,
            rest_music_enabled: default_rest_music_enabled(),
            rest_music_directory: rest_music_directory_default(),
            theme: Theme::Auto,
            autostart: false,
            minimize_to_tray: true,
            close_to_tray: true,
            language: Language::EnglishUnitedStates,
            version: "1.0.0".to_string(),
            updated_at: Utc::now(),
        }
    }
}

/// Work/Break session record
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    #[serde(rename = "type")]
    pub session_type: SessionType,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub duration: i64,         // actual duration in seconds
    pub planned_duration: i64, // planned duration in seconds
    pub is_skipped: bool,
    pub extended_seconds: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionType {
    Work,
    Break,
}

/// Timer information for UI
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerInfo {
    pub phase: TimerPhase,
    pub state: TimerState,
    pub remaining_minutes: u32,
    pub total_minutes: u32,
    pub next_transition_time: Option<DateTime<Utc>>,
    // 下一次真正“开始休息”的时间（考虑了“X 小时不休息/直到明天早晨”抑制逻辑）。
    pub next_break_time: Option<DateTime<Utc>>,
}

/// Analytics data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsData {
    pub total_work_seconds: i64,
    pub total_break_seconds: i64,
    pub break_count: usize,
    pub completed_breaks: usize,
    pub skipped_breaks: usize,
    pub sessions: Vec<Session>,
}

/// Analytics query parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyticsQuery {
    pub start_date: DateTime<Utc>,
    pub end_date: DateTime<Utc>,
}

/// Monitor information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: u32,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

/// System status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    pub is_fullscreen: bool,
    pub is_do_not_disturb: bool,
}
