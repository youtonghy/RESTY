use crate::models::{
    default_work_segments, rest_music_directory_default, AchievementUnlock, AnalyticsData,
    AnalyticsQuery, Session, SessionType, SessionsBounds, Settings,
};
use crate::utils::{AppError, AppResult};
use chrono::Utc;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

const ACHIEVEMENT_FIRST_BREAK: &str = "first_break";
const ACHIEVEMENT_FIRST_WORK: &str = "first_work";
const ACHIEVEMENT_ENABLE_AUTOSTART: &str = "enable_autostart";
const ACHIEVEMENT_WORK_10_HOURS: &str = "work_10_hours";
const ACHIEVEMENT_WORK_100_HOURS: &str = "work_100_hours";
const ACHIEVEMENT_WORK_500_HOURS: &str = "work_500_hours";
const ACHIEVEMENT_WORK_1000_HOURS: &str = "work_1000_hours";
const ACHIEVEMENT_BREAK_10_HOURS: &str = "break_10_hours";
const ACHIEVEMENT_BREAK_100_HOURS: &str = "break_100_hours";
const ACHIEVEMENT_BREAK_200_HOURS: &str = "break_200_hours";
const ACHIEVEMENT_BREAK_300_HOURS: &str = "break_300_hours";
const ACHIEVEMENT_BREAK_400_HOURS: &str = "break_400_hours";
const ACHIEVEMENT_BREAK_500_HOURS: &str = "break_500_hours";
const ACHIEVEMENT_BREAK_750_HOURS: &str = "break_750_hours";
const ACHIEVEMENT_BREAK_1000_HOURS: &str = "break_1000_hours";

const POWER_INTERRUPT_BREAK_NOTE: &str = "power-interrupt-break";
const POWER_INTERRUPT_WORK_NOTE: &str = "power-interrupt-work";

const SECONDS_PER_HOUR: i64 = 3600;
const WORK_10_HOURS_SECONDS: i64 = 10 * SECONDS_PER_HOUR;
const WORK_100_HOURS_SECONDS: i64 = 100 * SECONDS_PER_HOUR;
const WORK_500_HOURS_SECONDS: i64 = 500 * SECONDS_PER_HOUR;
const WORK_1000_HOURS_SECONDS: i64 = 1000 * SECONDS_PER_HOUR;
const BREAK_10_HOURS_SECONDS: i64 = 10 * SECONDS_PER_HOUR;
const BREAK_100_HOURS_SECONDS: i64 = 100 * SECONDS_PER_HOUR;
const BREAK_200_HOURS_SECONDS: i64 = 200 * SECONDS_PER_HOUR;
const BREAK_300_HOURS_SECONDS: i64 = 300 * SECONDS_PER_HOUR;
const BREAK_400_HOURS_SECONDS: i64 = 400 * SECONDS_PER_HOUR;
const BREAK_500_HOURS_SECONDS: i64 = 500 * SECONDS_PER_HOUR;
const BREAK_750_HOURS_SECONDS: i64 = 750 * SECONDS_PER_HOUR;
const BREAK_1000_HOURS_SECONDS: i64 = 1000 * SECONDS_PER_HOUR;

/// Database service for managing persistent data.
/// 使用本地 JSON 文件持久化设置与会话历史。
pub struct DatabaseService {
    app: AppHandle,
    settings: Mutex<Settings>,
    sessions: Mutex<Vec<Session>>,
    achievements: Mutex<Vec<AchievementUnlock>>,
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
            achievements: Mutex::new(Vec::new()),
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

        // Load achievements from file
        self.load_achievements_from_file().await?;

        // Reconcile achievements for existing data
        self.reconcile_achievements().await?;

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

    /// Get achievements file path
    fn achievements_file(&self) -> PathBuf {
        self.data_dir.join("achievements.json")
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

    /// Load achievements from file
    async fn load_achievements_from_file(&self) -> AppResult<()> {
        let file_path = self.achievements_file();

        if file_path.exists() {
            let content = std::fs::read_to_string(&file_path).map_err(|e| {
                AppError::DatabaseError(format!("Failed to read achievements file: {}", e))
            })?;

            let loaded: Vec<AchievementUnlock> = serde_json::from_str(&content)
                .map_err(|e| AppError::DatabaseError(format!("Failed to parse achievements: {}", e)))?;

            let mut achievements = self.achievements.lock().await;
            *achievements = loaded;
        }

        Ok(())
    }

    fn is_completed_work(session: &Session) -> bool {
        matches!(session.session_type, SessionType::Work)
            && !session.is_skipped
            && session.duration > 0
    }

    fn is_completed_break(session: &Session) -> bool {
        matches!(session.session_type, SessionType::Break)
            && !session.is_skipped
            && session.duration > 0
    }

    fn session_seconds(session: &Session) -> i64 {
        if session.duration > 0 {
            return session.duration;
        }
        let diff = session.end_time - session.start_time;
        diff.num_seconds().max(0)
    }

    fn total_work_seconds(sessions: &[Session]) -> i64 {
        sessions
            .iter()
            .filter(|session| matches!(session.session_type, SessionType::Work))
            .map(Self::session_seconds)
            .sum()
    }

    fn total_break_seconds(sessions: &[Session], include_more_rest: bool) -> i64 {
        let mut total: i64 = sessions
            .iter()
            .filter(|session| matches!(session.session_type, SessionType::Break))
            .map(Self::session_seconds)
            .sum();

        if include_more_rest {
            total += Self::more_rest_gap_seconds(sessions);
        }

        total
    }

    fn more_rest_gap_seconds(sessions: &[Session]) -> i64 {
        if sessions.len() < 2 {
            return 0;
        }

        let mut ordered = sessions.to_vec();
        ordered.sort_by_key(|session| session.start_time);

        let mut total = 0;
        for idx in 0..ordered.len().saturating_sub(1) {
            let prev = &ordered[idx];
            let next = &ordered[idx + 1];
            let gap_seconds = (next.start_time - prev.end_time).num_seconds();
            if gap_seconds <= 0 {
                continue;
            }
            let prev_note = prev.notes.as_deref();
            let should_fill =
                (matches!(prev.session_type, SessionType::Work)
                    && matches!(next.session_type, SessionType::Work)
                    && prev_note != Some(POWER_INTERRUPT_WORK_NOTE))
                    || prev_note == Some(POWER_INTERRUPT_BREAK_NOTE);
            if !should_fill {
                continue;
            }
            total += gap_seconds;
        }

        total
    }

    fn persist_achievements(&self, achievements: &[AchievementUnlock]) -> AppResult<()> {
        let json = serde_json::to_string_pretty(achievements)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize achievements: {}", e)))?;

        std::fs::write(self.achievements_file(), json).map_err(|e| {
            AppError::DatabaseError(format!("Failed to write achievements file: {}", e))
        })?;

        Ok(())
    }

    async fn unlock_achievement(&self, id: &str) -> AppResult<Option<AchievementUnlock>> {
        let mut achievements = self.achievements.lock().await;
        if achievements.iter().any(|item| item.id == id) {
            return Ok(None);
        }

        let unlock = AchievementUnlock {
            id: id.to_string(),
            unlocked_at: Utc::now(),
        };
        achievements.push(unlock.clone());
        self.persist_achievements(&achievements)?;

        let _ = self.app.emit("achievement-unlocked", unlock.clone());

        Ok(Some(unlock))
    }

    async fn unlock_for_session(&self, session: &Session) -> AppResult<()> {
        if Self::is_completed_work(session) {
            let _ = self.unlock_achievement(ACHIEVEMENT_FIRST_WORK).await?;
        }
        if Self::is_completed_break(session) {
            let _ = self.unlock_achievement(ACHIEVEMENT_FIRST_BREAK).await?;
        }
        Ok(())
    }

    async fn unlock_duration_achievements(
        &self,
        sessions: &[Session],
        more_rest_enabled: bool,
    ) -> AppResult<()> {
        let total_work_seconds = Self::total_work_seconds(sessions);
        let total_break_seconds = Self::total_break_seconds(sessions, more_rest_enabled);

        for (threshold, achievement_id) in [
            (WORK_10_HOURS_SECONDS, ACHIEVEMENT_WORK_10_HOURS),
            (WORK_100_HOURS_SECONDS, ACHIEVEMENT_WORK_100_HOURS),
            (WORK_500_HOURS_SECONDS, ACHIEVEMENT_WORK_500_HOURS),
            (WORK_1000_HOURS_SECONDS, ACHIEVEMENT_WORK_1000_HOURS),
        ] {
            if total_work_seconds >= threshold {
                let _ = self.unlock_achievement(achievement_id).await?;
            }
        }

        for (threshold, achievement_id) in [
            (BREAK_10_HOURS_SECONDS, ACHIEVEMENT_BREAK_10_HOURS),
            (BREAK_100_HOURS_SECONDS, ACHIEVEMENT_BREAK_100_HOURS),
            (BREAK_200_HOURS_SECONDS, ACHIEVEMENT_BREAK_200_HOURS),
            (BREAK_300_HOURS_SECONDS, ACHIEVEMENT_BREAK_300_HOURS),
            (BREAK_400_HOURS_SECONDS, ACHIEVEMENT_BREAK_400_HOURS),
            (BREAK_500_HOURS_SECONDS, ACHIEVEMENT_BREAK_500_HOURS),
            (BREAK_750_HOURS_SECONDS, ACHIEVEMENT_BREAK_750_HOURS),
            (BREAK_1000_HOURS_SECONDS, ACHIEVEMENT_BREAK_1000_HOURS),
        ] {
            if total_break_seconds >= threshold {
                let _ = self.unlock_achievement(achievement_id).await?;
            }
        }

        Ok(())
    }

    async fn reconcile_achievements(&self) -> AppResult<()> {
        let sessions_snapshot = {
            let sessions = self.sessions.lock().await;
            sessions.clone()
        };
        let settings_snapshot = {
            let settings = self.settings.lock().await;
            settings.clone()
        };

        if settings_snapshot.autostart {
            let _ = self.unlock_achievement(ACHIEVEMENT_ENABLE_AUTOSTART).await?;
        }

        if sessions_snapshot.iter().any(Self::is_completed_work) {
            let _ = self.unlock_achievement(ACHIEVEMENT_FIRST_WORK).await?;
        }

        if sessions_snapshot.iter().any(Self::is_completed_break) {
            let _ = self.unlock_achievement(ACHIEVEMENT_FIRST_BREAK).await?;
        }

        self.unlock_duration_achievements(
            &sessions_snapshot,
            settings_snapshot.more_rest_enabled,
        )
        .await?;

        Ok(())
    }

    pub async fn get_achievements(&self) -> AppResult<Vec<AchievementUnlock>> {
        let achievements = self.achievements.lock().await;
        Ok(achievements.clone())
    }

    pub async fn get_sessions(&self) -> AppResult<Vec<Session>> {
        let sessions = self.sessions.lock().await;
        Ok(sessions.clone())
    }

    pub async fn replace_sessions(&self, sessions: Vec<Session>) -> AppResult<()> {
        let json = serde_json::to_string_pretty(&sessions).map_err(|e| {
            AppError::DatabaseError(format!("Failed to serialize sessions: {}", e))
        })?;

        {
            let mut stored = self.sessions.lock().await;
            *stored = sessions.clone();
        }

        std::fs::write(self.sessions_file(), json).map_err(|e| {
            AppError::DatabaseError(format!("Failed to write sessions file: {}", e))
        })?;

        Ok(())
    }

    pub async fn replace_achievements(&self, achievements: Vec<AchievementUnlock>) -> AppResult<()> {
        {
            let mut stored = self.achievements.lock().await;
            *stored = achievements.clone();
        }

        self.persist_achievements(&achievements)?;

        Ok(())
    }

    /// Save settings to database
    /// 同步写入内存缓存与 `settings.json`。
    pub async fn save_settings(&self, settings: &Settings) -> AppResult<()> {
        let normalized = self.persist_settings(settings).await?;

        if normalized.autostart {
            let _ = self.unlock_achievement(ACHIEVEMENT_ENABLE_AUTOSTART).await?;
        }

        let sessions_snapshot = {
            let sessions = self.sessions.lock().await;
            sessions.clone()
        };
        self.unlock_duration_achievements(&sessions_snapshot, normalized.more_rest_enabled)
            .await?;

        Ok(())
    }

    /// 保存设置但不触发成就更新（用于导入场景）。
    pub async fn save_settings_without_achievements(&self, settings: &Settings) -> AppResult<()> {
        let _ = self.persist_settings(settings).await?;
        Ok(())
    }

    async fn persist_settings(&self, settings: &Settings) -> AppResult<Settings> {
        let mut normalized = settings.clone();
        normalized.minimize_to_tray = true;
        normalized.close_to_tray = true;
        if !normalized.autostart && normalized.silent_autostart {
            normalized.silent_autostart = false;
        }
        #[cfg(not(target_os = "windows"))]
        {
            normalized.auto_silent_update_enabled = false;
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

        Ok(normalized)
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
            #[cfg(not(target_os = "windows"))]
            if settings.auto_silent_update_enabled {
                settings.auto_silent_update_enabled = false;
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
        let sessions_snapshot = {
            let mut sessions = self.sessions.lock().await;
            sessions.push(session.clone());

            let json = serde_json::to_string_pretty(&*sessions)
                .map_err(|e| AppError::DatabaseError(format!("Failed to serialize sessions: {}", e)))?;

            std::fs::write(self.sessions_file(), json).map_err(|e| {
                AppError::DatabaseError(format!("Failed to write sessions file: {}", e))
            })?;

            sessions.clone()
        };
        let settings_snapshot = {
            let settings = self.settings.lock().await;
            settings.clone()
        };

        // Notify frontend listeners for real-time updates
        let _ = self.app.emit("session-upserted", session.clone());

        self.unlock_for_session(session).await?;
        self.unlock_duration_achievements(&sessions_snapshot, settings_snapshot.more_rest_enabled)
            .await?;

        Ok(())
    }

    /// Insert or update a session by `id`.
    /// 如果已存在相同 `id` 的会话，则更新其字段；否则追加。
    pub async fn save_or_update_session(&self, session: &Session) -> AppResult<()> {
        let sessions_snapshot = {
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

            sessions.clone()
        };
        let settings_snapshot = {
            let settings = self.settings.lock().await;
            settings.clone()
        };

        // Notify frontend listeners for real-time updates
        let _ = self.app.emit("session-upserted", session.clone());

        self.unlock_for_session(session).await?;
        self.unlock_duration_achievements(&sessions_snapshot, settings_snapshot.more_rest_enabled)
            .await?;

        Ok(())
    }

    /// Clear all session records and persist empty sessions.json
    pub async fn clear_sessions(&self) -> AppResult<()> {
        let empty: Vec<Session> = Vec::new();
        {
            let mut sessions = self.sessions.lock().await;
            *sessions = empty.clone();
        }

        let json = serde_json::to_string_pretty(&empty)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize sessions: {}", e)))?;

        std::fs::write(self.sessions_file(), json).map_err(|e| {
            AppError::DatabaseError(format!("Failed to write sessions file: {}", e))
        })?;

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

    /// Get sessions time bounds
    /// 获取会话数据的时间范围（最早开始/最晚结束）。
    pub async fn get_sessions_bounds(&self) -> AppResult<SessionsBounds> {
        let sessions = self.sessions.lock().await;
        let earliest_start = sessions.iter().map(|s| s.start_time).min();
        let latest_end = sessions.iter().map(|s| s.end_time).max();
        Ok(SessionsBounds {
            earliest_start,
            latest_end,
        })
    }
}
