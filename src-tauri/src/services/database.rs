use crate::models::{
    default_work_segments, rest_music_directory_default, AchievementUnlock, AnalyticsData,
    AnalyticsQuery, Session, SessionType, SessionsBounds, Settings,
};
use crate::utils::{AppError, AppResult};
use chrono::Utc;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{watch, Mutex, RwLock};

const ACHIEVEMENT_FIRST_BREAK: &str = "first_break";
const ACHIEVEMENT_FIRST_WORK: &str = "first_work";

fn mark_persisted_ready(sender: &watch::Sender<bool>) {
    sender.send_replace(true);
}
const ACHIEVEMENT_ENABLE_AUTOSTART: &str = "enable_autostart";

const POWER_INTERRUPT_BREAK_NOTE: &str = "power-interrupt-break";
const POWER_INTERRUPT_WORK_NOTE: &str = "power-interrupt-work";

const SECONDS_PER_HOUR: i64 = 3600;

/// Work milestones: 10, 50, 100, 500, 1000, then +500 infinitely.
fn work_hour_thresholds(total_seconds: i64) -> Vec<i64> {
    let total_hours = total_seconds / SECONDS_PER_HOUR;
    let fixed: Vec<i64> = vec![10, 50, 100, 500, 1000];
    let mut thresholds: Vec<i64> = Vec::new();

    for &h in &fixed {
        thresholds.push(h);
        if h > total_hours {
            return thresholds;
        }
    }

    // After 1000, step by 500
    let mut h: i64 = 1500;
    loop {
        thresholds.push(h);
        if h > total_hours {
            break;
        }
        h += 500;
    }
    thresholds
}

/// Break milestones: 10, 100, then +100 infinitely.
fn break_hour_thresholds(total_seconds: i64) -> Vec<i64> {
    let total_hours = total_seconds / SECONDS_PER_HOUR;
    let mut thresholds: Vec<i64> = vec![10];

    if 10 > total_hours {
        return thresholds;
    }

    // 100, 200, 300, ... +100 infinitely
    let mut h: i64 = 100;
    loop {
        thresholds.push(h);
        if h > total_hours {
            break;
        }
        h += 100;
    }
    thresholds
}

/// Database service for managing persistent data.
/// 使用本地 JSON 文件持久化设置与会话历史。
pub struct DatabaseService {
    app: AppHandle,
    settings: Mutex<Settings>,
    sessions: RwLock<Vec<Session>>,
    achievements: Mutex<Vec<AchievementUnlock>>,
    file_write_lock: Mutex<()>,
    data_dir: PathBuf,
    /// Flips to `true` once sessions/achievements have been read from disk.
    ///
    /// Loading those files is deferred off the startup path (see
    /// `initialize_persisted_data`) because deserializing a large `sessions.json`
    /// on the main thread delays the WebView's first navigation and can leave the
    /// window blank. Every accessor waits on this gate, so a session written
    /// before the load finishes can never be overwritten by the loaded snapshot.
    persisted_ready: watch::Sender<bool>,
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
            sessions: RwLock::new(Vec::new()),
            achievements: Mutex::new(Vec::new()),
            file_write_lock: Mutex::new(()),
            data_dir,
            persisted_ready: watch::channel(false).0,
        }
    }

    /// Prepare the data directory and load settings only.
    ///
    /// Kept deliberately cheap: startup blocks on this to decide window
    /// visibility, so it must not touch `sessions.json`.
    /// 创建数据目录并加载设置（启动关键路径，必须保持轻量）。
    pub async fn initialize_settings(&self) -> AppResult<()> {
        if !self.data_dir.exists() {
            fs::create_dir_all(&self.data_dir).map_err(|e| {
                AppError::DatabaseError(format!("Failed to create data directory: {}", e))
            })?;
        }

        self.load_settings_from_file().await?;

        Ok(())
    }

    /// Load session/achievement history, then reconcile achievements.
    ///
    /// Run this off the startup path. Opens the `persisted_ready` gate as soon as
    /// both files are in memory, so waiting readers/writers resume before the
    /// (comparatively slow) reconciliation finishes.
    /// 加载会话与成就历史并补齐成就（在启动关键路径之外执行）。
    pub async fn initialize_persisted_data(&self) -> AppResult<()> {
        let load_result = async {
            self.load_sessions_from_file().await?;
            self.load_achievements_from_file().await
        }
        .await;

        // Open the gate even on failure, otherwise every session read/write
        // would block forever on a transient disk error.
        mark_persisted_ready(&self.persisted_ready);
        load_result?;

        self.reconcile_achievements().await?;

        Ok(())
    }

    /// Wait until session/achievement history has been read from disk.
    async fn wait_persisted_ready(&self) {
        let mut rx = self.persisted_ready.subscribe();
        loop {
            if *rx.borrow_and_update() {
                return;
            }
            if rx.changed().await.is_err() {
                // Sender lives as long as `self`; treat closure as "ready".
                return;
            }
        }
    }

    /// Gated read guard for `sessions`.
    async fn sessions_read(&self) -> tokio::sync::RwLockReadGuard<'_, Vec<Session>> {
        self.wait_persisted_ready().await;
        self.sessions.read().await
    }

    /// Gated write guard for `sessions`.
    async fn sessions_write(&self) -> tokio::sync::RwLockWriteGuard<'_, Vec<Session>> {
        self.wait_persisted_ready().await;
        self.sessions.write().await
    }

    /// Gated guard for `achievements`.
    async fn achievements_lock(&self) -> tokio::sync::MutexGuard<'_, Vec<AchievementUnlock>> {
        self.wait_persisted_ready().await;
        self.achievements.lock().await
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

    fn emit_recovery_warning(&self, file_name: &str, backup_path: &Path) {
        let payload = serde_json::json!({
            "file": file_name,
            "backupPath": backup_path.to_string_lossy(),
        });
        let _ = self.app.emit("data-recovery-warning", payload);
    }

    fn backup_corrupted_file(&self, path: &Path) -> AppResult<PathBuf> {
        let timestamp = Utc::now().format("%Y%m%d%H%M%S");
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("data.json");
        let backup_path = path.with_file_name(format!("{file_name}.corrupted.{timestamp}"));

        fs::rename(path, &backup_path).map_err(|e| {
            AppError::DatabaseError(format!(
                "Failed to back up corrupted file {}: {}",
                path.display(),
                e
            ))
        })?;

        if let Some(name) = path.file_name().and_then(|value| value.to_str()) {
            self.emit_recovery_warning(name, &backup_path);
        }

        Ok(backup_path)
    }

    fn write_json_atomic(&self, target: PathBuf, json: &str) -> AppResult<()> {
        let parent = target.parent().unwrap_or(&self.data_dir);
        fs::create_dir_all(parent).map_err(|e| {
            AppError::DatabaseError(format!(
                "Failed to create data directory {}: {}",
                parent.display(),
                e
            ))
        })?;

        let file_name = target
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("data.json");
        let tmp_path = target.with_file_name(format!("{file_name}.tmp"));

        {
            let mut file = OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&tmp_path)
                .map_err(|e| {
                    AppError::DatabaseError(format!(
                        "Failed to create temp file {}: {}",
                        tmp_path.display(),
                        e
                    ))
                })?;
            file.write_all(json.as_bytes()).map_err(|e| {
                AppError::DatabaseError(format!(
                    "Failed to write temp file {}: {}",
                    tmp_path.display(),
                    e
                ))
            })?;
            file.sync_all().map_err(|e| {
                AppError::DatabaseError(format!(
                    "Failed to sync temp file {}: {}",
                    tmp_path.display(),
                    e
                ))
            })?;
        }

        fs::rename(&tmp_path, &target).map_err(|e| {
            AppError::DatabaseError(format!(
                "Failed to replace file {} atomically: {}",
                target.display(),
                e
            ))
        })?;

        let _ = OpenOptions::new()
            .read(true)
            .open(parent)
            .and_then(|dir| dir.sync_all());

        Ok(())
    }

    /// Load settings from file
    async fn load_settings_from_file(&self) -> AppResult<()> {
        let file_path = self.settings_file();

        if file_path.exists() {
            let content = fs::read_to_string(&file_path).map_err(|e| {
                AppError::DatabaseError(format!("Failed to read settings file: {}", e))
            })?;

            let loaded_settings: Settings = match serde_json::from_str(&content) {
                Ok(settings) => settings,
                Err(e) => {
                    let _ = self.backup_corrupted_file(&file_path)?;
                    eprintln!("Failed to parse settings; using defaults: {}", e);
                    Settings::default()
                }
            };

            let mut settings = self.settings.lock().await;
            *settings = loaded_settings;
        }

        Ok(())
    }

    /// Load sessions from file
    async fn load_sessions_from_file(&self) -> AppResult<()> {
        let file_path = self.sessions_file();

        if file_path.exists() {
            let content = fs::read_to_string(&file_path).map_err(|e| {
                AppError::DatabaseError(format!("Failed to read sessions file: {}", e))
            })?;

            let loaded_sessions: Vec<Session> = match serde_json::from_str(&content) {
                Ok(sessions) => sessions,
                Err(e) => {
                    let _ = self.backup_corrupted_file(&file_path)?;
                    eprintln!("Failed to parse sessions; starting with empty cache: {}", e);
                    Vec::new()
                }
            };

            let mut sessions = self.sessions.write().await;
            *sessions = loaded_sessions;
        }

        Ok(())
    }

    /// Load achievements from file
    async fn load_achievements_from_file(&self) -> AppResult<()> {
        let file_path = self.achievements_file();

        if file_path.exists() {
            let content = fs::read_to_string(&file_path).map_err(|e| {
                AppError::DatabaseError(format!("Failed to read achievements file: {}", e))
            })?;

            let loaded: Vec<AchievementUnlock> = match serde_json::from_str(&content) {
                Ok(achievements) => achievements,
                Err(e) => {
                    let _ = self.backup_corrupted_file(&file_path)?;
                    eprintln!("Failed to parse achievements; starting empty: {}", e);
                    Vec::new()
                }
            };

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
            let should_fill = (matches!(prev.session_type, SessionType::Work)
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

    async fn persist_achievements(&self, achievements: &[AchievementUnlock]) -> AppResult<()> {
        let json = serde_json::to_string_pretty(achievements).map_err(|e| {
            AppError::DatabaseError(format!("Failed to serialize achievements: {}", e))
        })?;

        let _guard = self.file_write_lock.lock().await;
        self.write_json_atomic(self.achievements_file(), &json)?;

        Ok(())
    }

    async fn persist_sessions(&self, sessions: &[Session]) -> AppResult<()> {
        let json = serde_json::to_string_pretty(sessions)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize sessions: {}", e)))?;

        let _guard = self.file_write_lock.lock().await;
        self.write_json_atomic(self.sessions_file(), &json)?;

        Ok(())
    }

    async fn unlock_achievement(&self, id: &str) -> AppResult<Option<AchievementUnlock>> {
        let mut achievements = self.achievements_lock().await;
        if achievements.iter().any(|item| item.id == id) {
            return Ok(None);
        }

        let unlock = AchievementUnlock {
            id: id.to_string(),
            unlocked_at: Utc::now(),
        };
        achievements.push(unlock.clone());
        self.persist_achievements(&achievements).await?;

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

        for hours in work_hour_thresholds(total_work_seconds) {
            let threshold_seconds = hours * SECONDS_PER_HOUR;
            if total_work_seconds >= threshold_seconds {
                let id = format!("work_{}_hours", hours);
                let _ = self.unlock_achievement(&id).await?;
            }
        }

        for hours in break_hour_thresholds(total_break_seconds) {
            let threshold_seconds = hours * SECONDS_PER_HOUR;
            if total_break_seconds >= threshold_seconds {
                let id = format!("break_{}_hours", hours);
                let _ = self.unlock_achievement(&id).await?;
            }
        }

        Ok(())
    }

    async fn reconcile_achievements(&self) -> AppResult<()> {
        let sessions_snapshot = {
            let sessions = self.sessions_read().await;
            sessions.clone()
        };
        let settings_snapshot = {
            let settings = self.settings.lock().await;
            settings.clone()
        };

        if settings_snapshot.autostart {
            let _ = self
                .unlock_achievement(ACHIEVEMENT_ENABLE_AUTOSTART)
                .await?;
        }

        if sessions_snapshot.iter().any(Self::is_completed_work) {
            let _ = self.unlock_achievement(ACHIEVEMENT_FIRST_WORK).await?;
        }

        if sessions_snapshot.iter().any(Self::is_completed_break) {
            let _ = self.unlock_achievement(ACHIEVEMENT_FIRST_BREAK).await?;
        }

        self.unlock_duration_achievements(&sessions_snapshot, settings_snapshot.more_rest_enabled)
            .await?;

        Ok(())
    }

    async fn analytics_disabled(&self) -> bool {
        let settings = self.settings.lock().await;
        settings.disable_analytics
    }

    async fn remove_session_by_id(&self, session_id: &str) -> AppResult<()> {
        let sessions_snapshot = {
            let mut sessions = self.sessions_write().await;
            let original_len = sessions.len();
            sessions.retain(|session| session.id != session_id);
            if sessions.len() == original_len {
                return Ok(());
            }
            sessions.clone()
        };

        self.persist_sessions(&sessions_snapshot).await?;
        Ok(())
    }

    pub async fn get_achievements(&self) -> AppResult<Vec<AchievementUnlock>> {
        let achievements = self.achievements_lock().await;
        Ok(achievements.clone())
    }

    pub async fn get_sessions(&self) -> AppResult<Vec<Session>> {
        let sessions = self.sessions_read().await;
        Ok(sessions.clone())
    }

    pub async fn replace_sessions(&self, sessions: Vec<Session>) -> AppResult<()> {
        {
            let mut stored = self.sessions_write().await;
            *stored = sessions.clone();
        }

        self.persist_sessions(&sessions).await?;

        Ok(())
    }

    pub async fn replace_achievements(
        &self,
        achievements: Vec<AchievementUnlock>,
    ) -> AppResult<()> {
        {
            let mut stored = self.achievements_lock().await;
            *stored = achievements.clone();
        }

        self.persist_achievements(&achievements).await?;

        Ok(())
    }

    /// Save settings to database
    /// 同步写入内存缓存与 `settings.json`。
    pub async fn save_settings(&self, settings: &Settings) -> AppResult<()> {
        let normalized = self.persist_settings(settings).await?;

        if normalized.autostart {
            let _ = self
                .unlock_achievement(ACHIEVEMENT_ENABLE_AUTOSTART)
                .await?;
        }

        let sessions_snapshot = {
            let sessions = self.sessions_read().await;
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
        #[cfg(not(target_os = "macos"))]
        {
            normalized.macos_menu_bar_only = false;
        }

        // Update in-memory settings
        {
            let mut stored_settings = self.settings.lock().await;
            *stored_settings = normalized.clone();
        }

        // Persist to file
        let json = serde_json::to_string_pretty(&normalized)
            .map_err(|e| AppError::DatabaseError(format!("Failed to serialize settings: {}", e)))?;

        {
            let _guard = self.file_write_lock.lock().await;
            self.write_json_atomic(self.settings_file(), &json)?;
        }

        // Ensure rest music directory exists when settings change
        if !normalized.rest_music_directory.trim().is_empty() {
            let target = PathBuf::from(&normalized.rest_music_directory);
            if let Err(e) = fs::create_dir_all(&target) {
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
                if let Err(e) = fs::create_dir_all(&dir) {
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

    /// Insert or update a session by `id`.
    /// 如果已存在相同 `id` 的会话，则更新其字段；否则追加。
    pub async fn save_or_update_session(&self, session: &Session) -> AppResult<()> {
        if self.analytics_disabled().await {
            self.remove_session_by_id(&session.id).await?;
            return Ok(());
        }

        let sessions_snapshot = {
            let mut sessions = self.sessions_write().await;

            if let Some(existing) = sessions.iter_mut().find(|s| s.id == session.id) {
                if !(existing.duration > 0 && session.duration == 0) {
                    *existing = session.clone();
                }
            } else {
                sessions.push(session.clone());
            }

            sessions.clone()
        };

        self.persist_sessions(&sessions_snapshot).await?;

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
            let mut sessions = self.sessions_write().await;
            *sessions = empty.clone();
        }

        self.persist_sessions(&empty).await?;

        Ok(())
    }

    /// Get analytics data for a date range
    /// 按时间区间筛选会话，计算统计指标。
    pub async fn get_analytics(&self, query: &AnalyticsQuery) -> AppResult<AnalyticsData> {
        if self.analytics_disabled().await {
            return Ok(AnalyticsData {
                total_work_seconds: 0,
                total_break_seconds: 0,
                break_count: 0,
                completed_breaks: 0,
                skipped_breaks: 0,
                sessions: Vec::new(),
            });
        }

        let filtered: Vec<Session> = {
            let sessions = self.sessions_read().await;

            // Filter sessions by overlap with date range [start_date, end_date]
            // 选择与区间有任意重叠的会话（而非仅按开始时间落在区间内）
            sessions
                .iter()
                .filter(|s| s.end_time >= query.start_date && s.start_time <= query.end_date)
                .cloned()
                .collect()
        };

        let overlap_seconds = |session: &Session| {
            let start = if session.start_time > query.start_date {
                session.start_time
            } else {
                query.start_date
            };
            let end = if session.end_time < query.end_date {
                session.end_time
            } else {
                query.end_date
            };
            (end - start).num_seconds().max(0)
        };

        // Calculate statistics using only the portion that overlaps the requested range.
        let total_work_seconds: i64 = filtered
            .iter()
            .filter(|s| matches!(s.session_type, crate::models::SessionType::Work))
            .map(overlap_seconds)
            .sum();

        let total_break_seconds: i64 = filtered
            .iter()
            .filter(|s| {
                matches!(s.session_type, crate::models::SessionType::Break) && !s.is_skipped
            })
            .map(overlap_seconds)
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
            sessions: filtered,
        })
    }

    /// Get sessions time bounds
    /// 获取会话数据的时间范围（最早开始/最晚结束）。
    pub async fn get_sessions_bounds(&self) -> AppResult<SessionsBounds> {
        if self.analytics_disabled().await {
            return Ok(SessionsBounds {
                earliest_start: None,
                latest_end: None,
            });
        }

        let sessions = self.sessions_read().await;
        let earliest_start = sessions.iter().map(|s| s.start_time).min();
        let latest_end = sessions.iter().map(|s| s.end_time).max();
        Ok(SessionsBounds {
            earliest_start,
            latest_end,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::mark_persisted_ready;
    use tokio::sync::watch;

    #[test]
    fn persisted_ready_is_visible_to_late_subscribers() {
        let (sender, receiver) = watch::channel(false);
        drop(receiver);

        mark_persisted_ready(&sender);

        let late_subscriber = sender.subscribe();
        assert!(*late_subscriber.borrow());
    }
}
