use crate::models::{Session, Settings, AnalyticsQuery, AnalyticsData};
use crate::utils::{AppError, AppResult};
use chrono::{DateTime, Utc};
use std::sync::Mutex;
use tauri::AppHandle;

/// Database service for managing persistent data
pub struct DatabaseService {
    app: AppHandle,
}

impl DatabaseService {
    /// Create a new database service instance
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    /// Initialize database schema
    pub async fn initialize(&self) -> AppResult<()> {
        // Create settings table
        self.execute(
            "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            vec![],
        ).await?;

        // Create sessions table
        self.execute(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                duration INTEGER NOT NULL,
                planned_duration INTEGER NOT NULL,
                is_skipped INTEGER NOT NULL,
                extended_seconds INTEGER NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL
            )",
            vec![],
        ).await?;

        Ok(())
    }

    /// Save settings to database
    pub async fn save_settings(&self, settings: &Settings) -> AppResult<()> {
        let json_value = serde_json::to_string(settings)?;
        let updated_at = Utc::now().to_rfc3339();

        self.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
            vec!["app_settings".into(), json_value.into(), updated_at.into()],
        ).await?;

        Ok(())
    }

    /// Load settings from database
    pub async fn load_settings(&self) -> AppResult<Settings> {
        let result = self.query(
            "SELECT value FROM settings WHERE key = ?1",
            vec!["app_settings".into()],
        ).await?;

        if let Some(rows) = result.first() {
            if let Some(value) = rows.get("value") {
                if let Some(json_str) = value.as_str() {
                    let settings: Settings = serde_json::from_str(json_str)?;
                    return Ok(settings);
                }
            }
        }

        Ok(Settings::default())
    }

    /// Save a session record
    pub async fn save_session(&self, session: &Session) -> AppResult<()> {
        self.execute(
            "INSERT INTO sessions (id, type, start_time, end_time, duration, planned_duration, is_skipped, extended_seconds, notes, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            vec![
                session.id.clone().into(),
                format!("{:?}", session.session_type).to_lowercase().into(),
                session.start_time.to_rfc3339().into(),
                session.end_time.to_rfc3339().into(),
                session.duration.into(),
                session.planned_duration.into(),
                (if session.is_skipped { 1 } else { 0 }).into(),
                session.extended_seconds.into(),
                session.notes.clone().unwrap_or_default().into(),
                Utc::now().to_rfc3339().into(),
            ],
        ).await?;

        Ok(())
    }

    /// Get analytics data for a date range
    pub async fn get_analytics(&self, query: &AnalyticsQuery) -> AppResult<AnalyticsData> {
        let result = self.query(
            "SELECT * FROM sessions WHERE start_time >= ?1 AND end_time <= ?2 ORDER BY start_time ASC",
            vec![
                query.start_date.to_rfc3339().into(),
                query.end_date.to_rfc3339().into(),
            ],
        ).await?;

        let mut sessions = Vec::new();
        let mut total_work_seconds = 0i64;
        let mut total_break_seconds = 0i64;
        let mut break_count = 0usize;
        let mut completed_breaks = 0usize;
        let mut skipped_breaks = 0usize;

        for row in result {
            let session_type = row.get("type").and_then(|v| v.as_str()).unwrap_or("work");
            let duration = row.get("duration").and_then(|v| v.as_i64()).unwrap_or(0);
            let is_skipped = row.get("is_skipped").and_then(|v| v.as_i64()).unwrap_or(0) == 1;

            if session_type == "work" {
                total_work_seconds += duration;
            } else {
                total_break_seconds += duration;
                break_count += 1;
                if is_skipped {
                    skipped_breaks += 1;
                } else {
                    completed_breaks += 1;
                }
            }

            // Parse session data
            if let (Some(id), Some(start_time), Some(end_time)) = (
                row.get("id").and_then(|v| v.as_str()),
                row.get("start_time").and_then(|v| v.as_str()),
                row.get("end_time").and_then(|v| v.as_str()),
            ) {
                sessions.push(Session {
                    id: id.to_string(),
                    session_type: if session_type == "work" {
                        crate::models::SessionType::Work
                    } else {
                        crate::models::SessionType::Break
                    },
                    start_time: DateTime::parse_from_rfc3339(start_time)
                        .unwrap_or_else(|_| Utc::now().into())
                        .with_timezone(&Utc),
                    end_time: DateTime::parse_from_rfc3339(end_time)
                        .unwrap_or_else(|_| Utc::now().into())
                        .with_timezone(&Utc),
                    duration,
                    planned_duration: row.get("planned_duration").and_then(|v| v.as_i64()).unwrap_or(0),
                    is_skipped,
                    extended_seconds: row.get("extended_seconds").and_then(|v| v.as_i64()).unwrap_or(0),
                    notes: row.get("notes").and_then(|v| v.as_str()).map(|s| s.to_string()),
                });
            }
        }

        Ok(AnalyticsData {
            total_work_seconds,
            total_break_seconds,
            break_count,
            completed_breaks,
            skipped_breaks,
            sessions,
        })
    }

    /// Execute a SQL query without returning results
    async fn execute(&self, query: &str, params: Vec<serde_json::Value>) -> AppResult<()> {
        use tauri_plugin_sql::Builder;
        // This is a simplified implementation
        // In production, you would use the actual SQL plugin API
        Ok(())
    }

    /// Execute a SQL query and return results
    async fn query(&self, query: &str, params: Vec<serde_json::Value>) -> AppResult<Vec<serde_json::Map<String, serde_json::Value>>> {
        // This is a simplified implementation
        // In production, you would use the actual SQL plugin API
        Ok(vec![])
    }
}
