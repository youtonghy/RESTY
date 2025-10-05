use crate::models::{Session, Settings, AnalyticsQuery, AnalyticsData};
use crate::utils::{AppError, AppResult};
use chrono::{DateTime, Utc};
use std::sync::Mutex;
use tauri::AppHandle;

/// Database service for managing persistent data
/// Currently using in-memory storage for simplicity
pub struct DatabaseService {
    app: AppHandle,
    settings: Mutex<Settings>,
    sessions: Mutex<Vec<Session>>,
}

impl DatabaseService {
    /// Create a new database service instance
    pub fn new(app: AppHandle) -> Self {
        Self {
            app,
            settings: Mutex::new(Settings::default()),
            sessions: Mutex::new(Vec::new()),
        }
    }

    /// Initialize database schema
    pub async fn initialize(&self) -> AppResult<()> {
        // For now, we're using in-memory storage
        // TODO: Implement persistent SQLite storage
        Ok(())
    }

    /// Save settings to database
    pub async fn save_settings(&self, settings: &Settings) -> AppResult<()> {
        let mut stored_settings = self.settings.lock().map_err(|_| AppError::DatabaseError)?;
        *stored_settings = settings.clone();
        Ok(())
    }

    /// Load settings from database
    pub async fn load_settings(&self) -> AppResult<Settings> {
        let settings = self.settings.lock().map_err(|_| AppError::DatabaseError)?;
        Ok(settings.clone())
    }

    /// Save a completed session
    pub async fn save_session(&self, session: &Session) -> AppResult<()> {
        let mut sessions = self.sessions.lock().map_err(|_| AppError::DatabaseError)?;
        sessions.push(session.clone());
        Ok(())
    }

    /// Get analytics data for a date range
    pub async fn get_analytics(&self, query: &AnalyticsQuery) -> AppResult<AnalyticsData> {
        let sessions = self.sessions.lock().map_err(|_| AppError::DatabaseError)?;

        // Filter sessions by date range
        let filtered: Vec<&Session> = sessions
            .iter()
            .filter(|s| {
                s.start_time >= query.start_date && s.start_time <= query.end_date
            })
            .collect();

        // Calculate statistics
        let total_work_seconds: i64 = filtered
            .iter()
            .filter(|s| matches!(s.session_type, crate::models::SessionType::Work))
            .map(|s| s.duration)
            .sum();

        let total_break_seconds: i64 = filtered
            .iter()
            .filter(|s| matches!(s.session_type, crate::models::SessionType::Break))
            .map(|s| s.duration)
            .sum();

        let break_count = filtered
            .iter()
            .filter(|s| matches!(s.session_type, crate::models::SessionType::Break))
            .count();

        let completed_breaks = filtered
            .iter()
            .filter(|s| matches!(s.session_type, crate::models::SessionType::Break) && !s.is_skipped)
            .count();

        let skipped_breaks = filtered
            .iter()
            .filter(|s| matches!(s.session_type, crate::models::SessionType::Break) && s.is_skipped)
            .count();

        Ok(AnalyticsData {
            total_work_seconds,
            total_break_seconds,
            break_count,
            completed_breaks,
            skipped_breaks,
            sessions: filtered.iter().map(|s| (*s).clone()).collect(),
        })
    }
}
