use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

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
    #[serde(rename = "en")]
    English,
    #[serde(rename = "zh-CN")]
    ChineseSimplified,
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
    pub work_duration: u32, // in minutes
    pub break_duration: u32, // in minutes
    pub enable_force_break: bool,

    // Reminder settings
    pub reminder_mode: ReminderMode,
    pub floating_position: FloatingPosition,
    pub opacity: u8, // 0-100
    pub play_sound: bool,

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
            reminder_mode: ReminderMode::Fullscreen,
            floating_position: FloatingPosition::TopRight,
            opacity: 95,
            play_sound: true,
            theme: Theme::Auto,
            autostart: false,
            minimize_to_tray: true,
            close_to_tray: true,
            language: Language::English,
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
    pub duration: i64, // actual duration in seconds
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
    pub remaining_seconds: u32,
    pub total_seconds: u32,
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
