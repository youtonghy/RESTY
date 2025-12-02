use crate::models::{
    default_work_segments, rest_music_directory_default, AnalyticsData, AnalyticsQuery, Session,
    Settings,
};
use crate::utils::{AppError, AppResult};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

/// Database service for managing persistent data.
/// 使用本地 JSON 文件持久化设置与会话历史。
pub struct DatabaseService {
    app: AppHandle,
    settings: Mutex<Settings>,
    sessions: Mutex<Vec<Session>>,
    data_dir: PathBuf,
}

impl DatabaseService {
    /// Create a new database service instance
    /// 计算数据目录并初始化内存缓存。
    pub fn new(app: AppHandle) -> Self {
        // Get app data directory
        let data_dir = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));

        Self {
            app,
            settings: Mutex::new(Settings::default()),
            sessions: Mutex::new(Vec::new()),
            data_dir,
        }
    }

    /// Initialize database schema
    /// 创建数据目录，加载已有设置与历史会话。
    pub async fn initialize(&self) -> AppResult<()> {
        // Create data directory if it doesn't exist
        if !self.data_dir.exists() {
            std::fs::create_dir_all(&self.data_dir).map_err(|e| {
                AppError::DatabaseError(format!("Failed to create data directory: {}", e))
            })?;
        }

        // Load settings from file
        self.load_settings_from_file().await?;

        // Load sessions from file
        self.load_sessions_from_file().await?;

        Ok(())
    }

    /// Get settings file path
    fn settings_file(&self) -> PathBuf {
        self.data_dir.join("settings.json")
    }

    /// Get sessions file path
    fn sessions_file(&self) -> PathBuf {
        self.data_dir.join("sessions.json")
    }

    /// Load settings from file
    async fn load_settings_from_file(&self) -> AppResult<()> {
        let file_path = self.settings_file();

        if file_path.exists() {
            let content = std::fs::read_to_string(&file_path).map_err(|e| {
                AppError::DatabaseError(format!("Failed to read settings file: {}", e))
            })?;

            let loaded_settings: Settings = serde_json::from_str(&content)
                .map_err(|e| AppError::DatabaseError(format!("Failed to parse settings: {}", e)))?;

            let mut settings = self.settings.lock().await;
            *settings = loaded_settings;
        }

        Ok(())
    }

    /// Load sessions from file
    async fn load_sessions_from_file(&self) -> AppResult<()> {
        let file_path = self.sessions_file();

        if file_path.exists() {
            let content = std::fs::read_to_string(&file_path).map_err(|e| {
                AppError::DatabaseError(format!("Failed to read sessions file: {}", e))
            })?;

            let loaded_sessions: Vec<Session> = serde_json::from_str(&content)
                .map_err(|e| AppError::DatabaseError(format!("Failed to parse sessions: {}", e)))?;

            let mut sessions = self.sessions.lock().await;
            *sessions = loaded_sessions;
        }

        Ok(())
    }

    /// Save settings to database
    /// 同步写入内存缓存与 `settings.json`。
    pub async fn save_settings(&self, settings: &Settings) -> AppResult<()> {
        let mut normalized = settings.clone();
        normalized.minimize_to_tray = true;
        normalized.close_to_tray = true;
        if !normalized.autostart && normalized.silent_autostart {
            normalized.silent_autostart = false;
        }

        // Update in-memory settings
        {
            let mut stored_settings = self.settings.lock().await;
            *stored_settings = normalized.clone();
        }

        // Persist to file
        let json = serde_json::to_string_pretty(&normalized)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize settings: {}", e)))?;

        std::fs::write(self.settings_file(), json).map_err(|e| {
            AppError::DatabaseError(format!("Failed to write settings file: {}", e))
        })?;

        // Ensure rest music directory exists when settings change
        if !normalized.rest_music_directory.trim().is_empty() {
            let target = PathBuf::from(&normalized.rest_music_directory);
            if let Err(e) = std::fs::create_dir_all(&target) {
                return Err(AppError::DatabaseError(format!(
                    "Failed to create rest music directory: {}",
                    e
                )));
            }
        }

        Ok(())
    }

    /// Load settings from database
    /// 返回内存中的设置快照。
    pub async fn load_settings(&self) -> AppResult<Settings> {
        let (snapshot, needs_persist) = {
            let mut settings = self.settings.lock().await;

            let mut persist_flag = false;
            if !settings.minimize_to_tray {
                settings.minimize_to_tray = true;
                persist_flag = true;
            }
            if !settings.close_to_tray {
                settings.close_to_tray = true;
                persist_flag = true;
            }
            if settings.rest_music_directory.trim().is_empty() {
                settings.rest_music_directory = rest_music_directory_default();
                persist_flag = true;
            }
            if settings.silent_autostart && !settings.autostart {
                settings.silent_autostart = false;
                persist_flag = true;
            }
            if settings.work_segments.is_empty() {
                settings.work_segments = default_work_segments();
                settings.segmented_work_enabled = false;
                persist_flag = true;
            }

            let dir = PathBuf::from(&settings.rest_music_directory);
            if !dir.exists() {
                if let Err(e) = std::fs::create_dir_all(&dir) {
                    return Err(AppError::DatabaseError(format!(
                        "Failed to create rest music directory: {}",
                        e
                    )));
                }
                persist_flag = true;
            }

            (settings.clone(), persist_flag)
        };

        if needs_persist {
            self.save_settings(&snapshot).await?;
        }

        Ok(snapshot)
    }

    /// Save a completed session
    /// 追加会话记录并写入 `sessions.json`。
    pub async fn save_session(&self, session: &Session) -> AppResult<()> {
        // Add to in-memory sessions
        let mut sessions = self.sessions.lock().await;
        sessions.push(session.clone());

        // Persist to file
        let json = serde_json::to_string_pretty(&*sessions)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize sessions: {}", e)))?;

        std::fs::write(self.sessions_file(), json).map_err(|e| {
            AppError::DatabaseError(format!("Failed to write sessions file: {}", e))
        })?;

        // Notify frontend listeners for real-time updates
        let _ = self.app.emit("session-upserted", session.clone());

        Ok(())
    }

    /// Insert or update a session by `id`.
    /// 如果已存在相同 `id` 的会话，则更新其字段；否则追加。
    pub async fn save_or_update_session(&self, session: &Session) -> AppResult<()> {
        let mut sessions = self.sessions.lock().await;

        if let Some(existing) = sessions.iter_mut().find(|s| s.id == session.id) {
            *existing = session.clone();
        } else {
            sessions.push(session.clone());
        }

        let json = serde_json::to_string_pretty(&*sessions)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize sessions: {}", e)))?;

        std::fs::write(self.sessions_file(), json).map_err(|e| {
            AppError::DatabaseError(format!("Failed to write sessions file: {}", e))
        })?;

        // Notify frontend listeners for real-time updates
        let _ = self.app.emit("session-upserted", session.clone());

        Ok(())
    }

    /// Get analytics data for a date range
    /// 按时间区间筛选会话，计算统计指标。
    pub async fn get_analytics(&self, query: &AnalyticsQuery) -> AppResult<AnalyticsData> {
        let sessions = self.sessions.lock().await;

        // Filter sessions by overlap with date range [start_date, end_date]
        // 选择与区间有任意重叠的会话（而非仅按开始时间落在区间内）
        let filtered: Vec<&Session> = sessions
            .iter()
            .filter(|s| s.end_time >= query.start_date && s.start_time <= query.end_date)
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
            .filter(|s| {
                matches!(s.session_type, crate::models::SessionType::Break) && !s.is_skipped
            })
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
