use crate::models::{Session, SessionType, TimerInfo, TimerPhase, TimerState, WorkSegment};
use crate::services::DatabaseService;
use crate::utils::AppResult;
use chrono::{Duration as ChronoDuration, Local, TimeZone, Utc};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::time::{self, Duration as TokioDuration, MissedTickBehavior};
use uuid::Uuid;

/// Timer service for managing work/break cycles.
/// 负责管理工作/休息阶段状态与事件广播。
pub struct TimerService {
    state: Arc<Mutex<TimerServiceState>>,
    app: AppHandle,
    db: Arc<tokio::sync::Mutex<DatabaseService>>, // database handle for persisting sessions
}

struct TimerServiceState {
    phase: TimerPhase,
    state: TimerState,
    remaining_seconds: u32,
    total_seconds: u32,
    work_duration: u32,  // in minutes (from settings)
    break_duration: u32, // in minutes (from settings)
    base_work_duration: u32,
    base_break_duration: u32,
    flow_mode: bool,
    segmented_enabled: bool,
    segments: Vec<WorkSegment>,
    segment_index: usize,
    segment_iteration: u32,
    phase_end_time: Option<chrono::DateTime<Utc>>,
    current_session_id: Option<String>,
    current_session_start: Option<chrono::DateTime<Utc>>,
    auto_cycle: bool, // Auto cycle between work and break
    // When set, automatically skip breaks until this time
    suppress_breaks_until: Option<chrono::DateTime<Utc>>,
    paused_due_to_display_off: bool,
    paused_due_to_system_suspend: bool,
}

impl TimerServiceState {
    fn has_segments(&self) -> bool {
        self.segmented_enabled && !self.segments.is_empty()
    }

    fn apply_current_segment(&mut self) {
        if self.has_segments() {
            let idx = self
                .segment_index
                .min(self.segments.len().saturating_sub(1));
            if let Some(segment) = self.segments.get(idx) {
                self.work_duration = segment.work_minutes.max(1);
                self.break_duration = segment.break_minutes.max(1);
                return;
            }
        }
        self.work_duration = self.base_work_duration.max(1);
        self.break_duration = self.base_break_duration.max(1);
    }

    fn reset_segment_progress(&mut self) {
        self.segment_index = 0;
        self.segment_iteration = 0;
        self.apply_current_segment();
    }

    fn advance_segment_cycle(&mut self) {
        if !self.has_segments() {
            self.segment_index = 0;
            self.segment_iteration = 0;
            self.apply_current_segment();
            return;
        }

        let len = self.segments.len();
        if len == 0 {
            self.segment_index = 0;
            self.segment_iteration = 0;
            self.apply_current_segment();
            return;
        }

        let idx = self.segment_index.min(len - 1);
        let repeat = self.segments[idx].repeat.max(1);

        if self.segment_iteration + 1 < repeat {
            self.segment_iteration += 1;
        } else {
            self.segment_iteration = 0;
            self.segment_index = (idx + 1) % len;
        }

        self.apply_current_segment();
    }

    fn normalized_segment_index(&self, index: usize) -> usize {
        if self.segments.is_empty() {
            0
        } else {
            index.min(self.segments.len() - 1)
        }
    }

    fn cycle_work_minutes(&self, index: usize) -> u32 {
        if self.has_segments() && !self.segments.is_empty() {
            let idx = self.normalized_segment_index(index);
            self.segments
                .get(idx)
                .map(|seg| seg.work_minutes.max(1))
                .unwrap_or(self.base_work_duration.max(1))
        } else {
            self.base_work_duration.max(1)
        }
    }

    fn cycle_break_minutes(&self, index: usize) -> u32 {
        if self.has_segments() && !self.segments.is_empty() {
            let idx = self.normalized_segment_index(index);
            self.segments
                .get(idx)
                .map(|seg| seg.break_minutes.max(1))
                .unwrap_or(self.base_break_duration.max(1))
        } else {
            self.base_break_duration.max(1)
        }
    }

    fn next_cycle_position(&self, index: usize, iteration: u32) -> (usize, u32) {
        if !self.has_segments() || self.segments.is_empty() {
            return (0, 0);
        }
        let idx = self.normalized_segment_index(index);
        let repeat = self.segments[idx].repeat.max(1);
        if iteration + 1 < repeat {
            (idx, iteration + 1)
        } else {
            ((idx + 1) % self.segments.len(), 0)
        }
    }
}
impl TimerService {
    fn sanitize_segments(segments: Vec<WorkSegment>) -> Vec<WorkSegment> {
        segments
            .into_iter()
            .map(|mut segment| {
                if segment.work_minutes == 0 {
                    segment.work_minutes = 1;
                }
                if segment.work_minutes > 120 {
                    segment.work_minutes = 120;
                }
                if segment.break_minutes == 0 {
                    segment.break_minutes = 1;
                }
                if segment.break_minutes > 120 {
                    segment.break_minutes = 120;
                }
                if segment.repeat == 0 {
                    segment.repeat = 1;
                } else if segment.repeat > 12 {
                    segment.repeat = 12;
                }
                segment
            })
            .filter(|seg| seg.work_minutes > 0 && seg.break_minutes > 0)
            .collect()
    }

    fn advance_segment_if_needed(&self, segmented_active: bool) {
        if !segmented_active {
            return;
        }
        let mut state = self.state.lock().unwrap();
        state.advance_segment_cycle();
    }

    /// Create a new timer service
    /// 初始化服务，记录工作/休息时长并保留 AppHandle。
    pub fn new(
        app: AppHandle,
        db: Arc<tokio::sync::Mutex<DatabaseService>>,
        work_duration: u32,
        break_duration: u32,
        flow_mode: bool,
        segmented_enabled: bool,
        segments: Vec<WorkSegment>,
    ) -> Arc<Self> {
        let sanitized_segments = Self::sanitize_segments(segments);
        let mut state = TimerServiceState {
            phase: TimerPhase::Idle,
            state: TimerState::Stopped,
            remaining_seconds: 0,
            total_seconds: 0,
            work_duration,
            break_duration,
            base_work_duration: work_duration,
            base_break_duration: break_duration,
            flow_mode,
            segmented_enabled: segmented_enabled && !sanitized_segments.is_empty(),
            segments: sanitized_segments,
            segment_index: 0,
            segment_iteration: 0,
            phase_end_time: None,
            current_session_id: None,
            current_session_start: None,
            auto_cycle: true, // Enable auto cycle by default
            suppress_breaks_until: None,
            paused_due_to_display_off: false,
            paused_due_to_system_suspend: false,
        };
        state.reset_segment_progress();

        Arc::new(Self {
            state: Arc::new(Mutex::new(state)),
            app,
            db,
        })
    }

    /// Start work session
    /// 切换到工作阶段并重置计时。
    pub fn start_work(&self) -> AppResult<()> {
        let mut state = self.state.lock().unwrap();
        state.apply_current_segment();
        state.phase = TimerPhase::Work;
        state.state = TimerState::Running;
        let work_seconds = state.work_duration * 60;
        state.total_seconds = work_seconds;
        state.remaining_seconds = work_seconds;
        let start_time = Utc::now();
        state.phase_end_time = Some(start_time + ChronoDuration::seconds(work_seconds as i64));
        state.current_session_id = Some(Uuid::new_v4().to_string());
        state.current_session_start = Some(start_time);
        state.paused_due_to_display_off = false;
        drop(state);

        self.emit_timer_update()?;
        self.emit_phase_change("work")?;
        self.persist_session_start();
        Ok(())
    }

    /// Start break session
    /// 切换到休息阶段并重置计时。
    pub fn start_break(&self) -> AppResult<()> {
        let mut state = self.state.lock().unwrap();
        state.apply_current_segment();
        state.phase = TimerPhase::Break;
        state.state = TimerState::Running;
        let break_seconds = state.break_duration * 60;
        state.total_seconds = break_seconds;
        state.remaining_seconds = break_seconds;
        let start_time = Utc::now();
        state.phase_end_time = Some(start_time + ChronoDuration::seconds(break_seconds as i64));
        state.current_session_id = Some(Uuid::new_v4().to_string());
        state.current_session_start = Some(start_time);
        state.paused_due_to_display_off = false;
        drop(state);

        self.emit_timer_update()?;
        self.emit_phase_change("break")?;
        self.persist_session_start();
        Ok(())
    }

    /// Pause timer
    /// 将计时器状态标记为暂停，不再递减剩余时间。
    pub fn pause(&self) -> AppResult<()> {
        let mut state = self.state.lock().unwrap();
        if state.state == TimerState::Running {
            state.state = TimerState::Paused;
            Self::update_remaining_seconds(&mut state);
            state.phase_end_time = None;
            drop(state);
            self.emit_timer_update()?;
        }
        Ok(())
    }

    /// Resume timer
    /// 恢复暂停的计时并重置最后一次 tick 时间。
    pub fn resume(&self) -> AppResult<()> {
        let mut state = self.state.lock().unwrap();
        if state.state == TimerState::Paused {
            state.state = TimerState::Running;
            let start = Utc::now();
            if state.remaining_seconds > 0 {
                state.phase_end_time =
                    Some(start + ChronoDuration::seconds(state.remaining_seconds as i64));
            } else {
                state.phase_end_time = Some(start);
            }
            state.paused_due_to_display_off = false;
            state.paused_due_to_system_suspend = false;
            drop(state);
            self.emit_timer_update()?;
        }
        Ok(())
    }

    /// Skip current phase
    /// 终止当前阶段并生成会话记录，返回给上层持久化。
    /// Returns (Session, should_show_break_reminder)
    pub fn skip(&self) -> AppResult<Option<(Session, bool)>> {
        println!("TimerService: skip called");
        let (previous_phase, session, segmented_active) = {
            let state = self.state.lock().unwrap();
            if state.phase == TimerPhase::Idle {
                println!("TimerService: skip ignored (Idle)");
                return Ok(None);
            }
            (
                state.phase.clone(),
                self.create_session_record(&state, true),
                state.has_segments(),
            )
        };

        // println!("TimerService: skip - stopping current timer");
        self.stop()?;

        let should_show_reminder = match previous_phase {
            TimerPhase::Work => {
                // println!("TimerService: skip - switching to break");
                // Skipping work should immediately begin the break phase
                self.start_break()?;
                // Fix: Do NOT return true here. The `start_break` inside `tick` handles the emission.
                // But `skip` is manual.
                // If I return true, the command emits it.
                // If I return false, no one emits it.
                // So returning true is correct for the command.
                true
            }
            TimerPhase::Break => {
                println!("TimerService: skip - switching to work");
                // Skipping break returns to the next work session
                self.advance_segment_if_needed(segmented_active);
                self.start_work()?;
                false
            }
            TimerPhase::Idle => false,
        };

        println!("TimerService: skip completed");
        Ok(Some((session, should_show_reminder)))
    }

    /// Extend current phase by minutes
    /// 延长当前阶段剩余时长，并通知前端刷新进度。
    pub fn extend(&self, minutes: u32) -> AppResult<()> {
        let mut state = self.state.lock().unwrap();
        let additional_seconds = minutes.max(1) * 60;
        state.remaining_seconds += additional_seconds;
        state.total_seconds += additional_seconds;
        if let Some(end_time) = state.phase_end_time {
            state.phase_end_time =
                Some(end_time + ChronoDuration::seconds(additional_seconds as i64));
        }
        drop(state);
        self.emit_timer_update()?;
        Ok(())
    }

    /// Stop timer
    /// 回到 Idle 状态，清空当前会话。
    pub fn stop(&self) -> AppResult<()> {
        let mut state = self.state.lock().unwrap();
        state.phase = TimerPhase::Idle;
        state.state = TimerState::Stopped;
        state.remaining_seconds = 0;
        state.total_seconds = 0;
        state.phase_end_time = None;
        state.current_session_id = None;
        state.current_session_start = None;
        state.paused_due_to_display_off = false;
        state.paused_due_to_system_suspend = false;
        drop(state);
        self.emit_timer_update()?;
        Ok(())
    }

    /// Tick timer (call every second)
    /// 定时器后台循环调用，每秒递减并在阶段结束时自动轮换。
    pub fn tick(&self) -> AppResult<Option<Session>> {
        let mut state = self.state.lock().unwrap();

        if state.state != TimerState::Running {
            return Ok(None);
        }

        let mut timer_finished = false;
        let next_phase = state.phase.clone();
        let mut session = None;

        if let Some(end_time) = state.phase_end_time {
            let now = Utc::now();
            if now >= end_time {
                state.remaining_seconds = 0;
                timer_finished = true;
                session = Some(self.create_session_record(&state, false));
                state.phase_end_time = None;
            } else {
                let diff = (end_time - now).num_seconds();
                state.remaining_seconds = diff.max(0) as u32;
            }
        }

        let flow_mode = state.flow_mode;
        let segmented_active = state.has_segments();
        let should_auto_cycle = timer_finished && state.auto_cycle;
        // Evaluate whether break suppression is active; clear if expired
        let suppress_breaks_active = if let Some(until) = state.suppress_breaks_until {
            if Utc::now() < until {
                true
            } else {
                // Clear expired suppression
                state.suppress_breaks_until = None;
                false
            }
        } else {
            false
        };
        drop(state);
        self.emit_timer_update()?;

        if timer_finished {
            println!("TimerService: timer finished, auto_cycle={}", should_auto_cycle);
            self.emit_timer_finished()?;
            if let Some(s) = session.clone() {
                self.persist_session_finish(s);
            }

            // Auto-cycle to next phase
            if should_auto_cycle {
                match next_phase {
                    TimerPhase::Work => {
                        // Work finished
                        if suppress_breaks_active || flow_mode {
                            println!("TimerService: Auto-cycling to work (suppressed/flow)");
                            self.advance_segment_if_needed(segmented_active);
                            // Skip break: immediately start another work session
                            self.start_work()?;
                        } else {
                            println!("TimerService: Auto-cycling to break");
                            // Start break and show reminder
                            self.start_break()?;
                            self.show_break_reminder()?;
                        }
                    }
                    TimerPhase::Break => {
                        println!("TimerService: Auto-cycling to work");
                        // Break finished, start work
                        self.advance_segment_if_needed(segmented_active);
                        self.start_work()?;
                    }
                    TimerPhase::Idle => {}
                }
            }
        }

        Ok(session)
    }

    /// React to system display power state changes.
    /// 当检测到显示器被熄灭/点亮时，自动暂停或恢复计时。
    pub fn handle_display_power_state(&self, display_on: bool) -> AppResult<()> {
        if display_on {
            let should_resume = {
                let mut state = self.state.lock().unwrap();
                if state.state == TimerState::Paused && state.paused_due_to_display_off {
                    state.paused_due_to_display_off = false;
                    true
                } else {
                    state.paused_due_to_display_off = false;
                    false
                }
            };
            if should_resume {
                self.resume()?;
            }
        } else {
            let should_pause = {
                let mut state = self.state.lock().unwrap();
                if state.state == TimerState::Running {
                    state.paused_due_to_display_off = true;
                    true
                } else {
                    false
                }
            };
            if should_pause {
                self.pause()?;
            }
        }

        Ok(())
    }

    /// Handle system suspend event (hibernate/sleep).
    /// 系统即将进入休眠/睡眠状态时调用，暂停计时器以防止时间漂移。
    pub fn handle_system_suspend(&self) -> AppResult<()> {
        let should_pause = {
            let mut state = self.state.lock().unwrap();
            if state.state == TimerState::Running {
                state.paused_due_to_system_suspend = true;
                true
            } else {
                false
            }
        };
        if should_pause {
            self.pause()?;
        }
        Ok(())
    }

    /// Handle system resume event (wake from hibernate/sleep).
    /// 系统从休眠/睡眠状态恢复时调用，恢复之前因休眠暂停的计时器。
    pub fn handle_system_resume(&self) -> AppResult<()> {
        let should_resume = {
            let mut state = self.state.lock().unwrap();
            if state.state == TimerState::Paused && state.paused_due_to_system_suspend {
                state.paused_due_to_system_suspend = false;
                true
            } else {
                state.paused_due_to_system_suspend = false;
                false
            }
        };
        if should_resume {
            self.resume()?;
        }
        Ok(())
    }

    /// Get current timer info
    pub fn get_info(&self) -> TimerInfo {
        let state = self.state.lock().unwrap();
        let next_break_time = Self::compute_next_break_time_from_state(&state);
        TimerInfo {
            phase: state.phase.clone(),
            state: state.state.clone(),
            remaining_seconds: state.remaining_seconds,
            total_seconds: state.total_seconds,
            next_transition_time: state.phase_end_time,
            next_break_time: if state.flow_mode {
                None
            } else {
                next_break_time
            },
        }
    }

    /// Update core timer configuration from settings.
    pub fn update_timer_configuration(
        &self,
        work_duration: u32,
        break_duration: u32,
        segmented_enabled: bool,
        segments: Vec<WorkSegment>,
    ) {
        let mut state = self.state.lock().unwrap();
        state.base_work_duration = work_duration.max(1);
        state.base_break_duration = break_duration.max(1);
        state.segments = Self::sanitize_segments(segments);
        state.segmented_enabled = segmented_enabled && !state.segments.is_empty();

        if !state.segmented_enabled {
            state.segment_index = 0;
            state.segment_iteration = 0;
        } else {
            if state.segment_index >= state.segments.len() {
                state.segment_index = 0;
                state.segment_iteration = 0;
            } else {
                let repeat = state.segments[state.segment_index].repeat.max(1);
                if state.segment_iteration >= repeat {
                    state.segment_iteration = 0;
                }
            }
        }

        state.apply_current_segment();
    }

    /// Update flow mode toggle based on settings.
    pub fn update_flow_mode(&self, enabled: bool) -> AppResult<()> {
        let mut state = self.state.lock().unwrap();
        if state.flow_mode == enabled {
            return Ok(());
        }
        state.flow_mode = enabled;
        let should_switch_to_work = enabled && matches!(state.phase, TimerPhase::Break);
        drop(state);

        if should_switch_to_work {
            if let Some((session, _)) = self.skip()? {
                self.persist_session_finish(session);
            }
        } else {
            self.emit_timer_update()?;
        }

        Ok(())
    }

    /// Do not take breaks for the specified number of hours from now.
    pub fn suppress_breaks_for_hours(&self, hours: i64) {
        let mut state = self.state.lock().unwrap();
        let until = Utc::now() + ChronoDuration::hours(hours.max(1));
        state.suppress_breaks_until = Some(until);
        drop(state);
        // 立即推送一次状态，确保前端的“下次休息时间”实时更新
        let _ = self.emit_timer_update();
    }

    /// Do not take breaks until tomorrow morning (08:00 local time).
    pub fn suppress_breaks_until_tomorrow_morning(&self) {
        // Compute tomorrow 08:00 in local time, convert to UTC
        let now_local = Local::now();
        let tomorrow_date = now_local.date_naive() + ChronoDuration::days(1);
        let morning = chrono::NaiveTime::from_hms_opt(8, 0, 0).unwrap();
        let naive_dt = chrono::NaiveDateTime::new(tomorrow_date, morning);
        let local_result = Local.from_local_datetime(&naive_dt);
        // Resolve ambiguous/invalid times by picking a valid candidate
        // Use a fallback of 24 hours from now if all resolution attempts fail
        let until_utc = local_result
            .single()
            .or_else(|| local_result.earliest())
            .or_else(|| local_result.latest())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|| Utc::now() + ChronoDuration::hours(24));
        let mut state = self.state.lock().unwrap();
        state.suppress_breaks_until = Some(until_utc);
        drop(state);
        // 立即推送一次状态，确保前端的"下次休息时间"实时更新
        let _ = self.emit_timer_update();
    }

    /// Create session record from current state
    fn create_session_record(&self, state: &TimerServiceState, is_skipped: bool) -> Session {
        let end_time = Utc::now();
        let start_time = state.current_session_start.unwrap_or(end_time);
        let actual_duration = (end_time - start_time).num_seconds();

        Session {
            id: state
                .current_session_id
                .clone()
                .unwrap_or_else(|| Uuid::new_v4().to_string()),
            session_type: match state.phase {
                TimerPhase::Work => SessionType::Work,
                TimerPhase::Break => SessionType::Break,
                TimerPhase::Idle => SessionType::Work,
            },
            start_time,
            end_time,
            duration: actual_duration,
            planned_duration: state.total_seconds as i64,
            is_skipped,
            extended_seconds: 0,
            notes: None,
        }
    }

    /// Persist a zero-duration session record at phase start (for later updates).
    fn persist_session_start(&self) {
        let (id, session_type, start_time, planned_secs) = {
            let state = self.state.lock().unwrap();
            (
                state
                    .current_session_id
                    .clone()
                    .unwrap_or_else(|| Uuid::new_v4().to_string()),
                state.phase.clone(),
                state.current_session_start.unwrap_or_else(Utc::now),
                state.total_seconds as i64,
            )
        };

        // Build a placeholder session with zero duration; will be updated on finish/skip
        let session = Session {
            id,
            session_type: match session_type {
                TimerPhase::Work => SessionType::Work,
                TimerPhase::Break => SessionType::Break,
                TimerPhase::Idle => SessionType::Work,
            },
            start_time,
            end_time: start_time,
            duration: 0,
            planned_duration: planned_secs,
            is_skipped: false,
            extended_seconds: 0,
            notes: None,
        };

        let db = self.db.clone();
        tauri::async_runtime::spawn(async move {
            if let Ok(guard) = db.try_lock() {
                let _ = guard.save_or_update_session(&session).await;
            } else {
                let db2 = db.lock().await;
                let _ = db2.save_or_update_session(&session).await;
            }
        });
    }

    /// Persist finished session (auto or skipped) updating the previously created record.
    fn persist_session_finish(&self, session: Session) {
        let db = self.db.clone();
        tauri::async_runtime::spawn(async move {
            if let Ok(guard) = db.try_lock() {
                let _ = guard.save_or_update_session(&session).await;
            } else {
                let db2 = db.lock().await;
                let _ = db2.save_or_update_session(&session).await;
            }
        });
    }

    /// Emit timer update event
    /// 将计时器状态推送给前端，驱动 UI 更新。
    fn emit_timer_update(&self) -> AppResult<()> {
        let info = self.get_info();
        self.app
            .emit("timer-update", info)
            .map_err(|e| crate::utils::AppError::TauriError(e.to_string()))?;
        Ok(())
    }

    /// Emit phase change event
    /// 通知前端阶段切换，用于弹窗或文案更新。
    fn emit_phase_change(&self, phase: &str) -> AppResult<()> {
        self.app
            .emit("phase-change", phase)
            .map_err(|e| crate::utils::AppError::TauriError(e.to_string()))?;
        Ok(())
    }

    /// Emit timer finished event
    /// 通知前端计时结束，可触发提示音或其他反馈。
    fn emit_timer_finished(&self) -> AppResult<()> {
        self.app
            .emit("timer-finished", ())
            .map_err(|e| crate::utils::AppError::TauriError(e.to_string()))?;
        Ok(())
    }

    /// Show break reminder window
    /// 触发前端或主进程创建休息提醒窗口。
    fn show_break_reminder(&self) -> AppResult<()> {
        self.app
            .emit("show-break-reminder", ())
            .map_err(|e| crate::utils::AppError::TauriError(e.to_string()))?;
        Ok(())
    }

    /// Start background ticker
    /// 在 Tokio 任务中启动秒级循环，持续驱动计时逻辑。
    pub fn start_ticker(self: Arc<Self>) {
        let service = Arc::clone(&self);
        tokio::spawn(async move {
            // Tick every second to ensure phase transitions happen on-time (00 seconds)
            let mut interval = time::interval(TokioDuration::from_secs(1));
            // Skip the backlog after system resume to avoid flooding the main thread.
            interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
            loop {
                interval.tick().await;
                if let Ok(session) = service.tick() {
                    if let Some(_session) = session {
                        // Session ended, could save to database here
                    }
                }
            }
        });
    }
}

impl TimerService {
    fn update_remaining_seconds(state: &mut TimerServiceState) {
        if let Some(end_time) = state.phase_end_time {
            let now = Utc::now();
            if now >= end_time {
                state.remaining_seconds = 0;
            } else {
                let diff = (end_time - now).num_seconds();
                state.remaining_seconds = diff.max(0) as u32;
            }
        }
    }

    /// 根据当前状态与"抑制休息"设置，计算下一次真正开始休息的时间。
    fn compute_next_break_time_from_state(
        state: &TimerServiceState,
    ) -> Option<chrono::DateTime<Utc>> {
        // Idle 阶段无法预测下一次休息时间
        if state.phase == TimerPhase::Idle {
            return None;
        }

        let now = Utc::now();
        // 休息抑制截止时间（若存在且在未来，则以它为界）
        let allow_break_from = match state.suppress_breaks_until {
            Some(t) if t > now => t,
            _ => now,
        };

        if !state.has_segments() {
            let base_work_seconds = (state.base_work_duration.max(1) * 60) as i64;
            let mut candidate = match state.phase {
                TimerPhase::Work => state.phase_end_time.unwrap_or_else(|| {
                    now + ChronoDuration::seconds(state.remaining_seconds.max(1) as i64)
                }),
                TimerPhase::Break => {
                    let break_end = state.phase_end_time.unwrap_or_else(|| {
                        now + ChronoDuration::seconds(state.remaining_seconds.max(1) as i64)
                    });
                    break_end + ChronoDuration::seconds(base_work_seconds)
                }
                TimerPhase::Idle => unreachable!(),
            };

            if candidate < allow_break_from {
                let diff_seconds = (allow_break_from - candidate).num_seconds();
                let mut cycles = diff_seconds / base_work_seconds;
                if diff_seconds % base_work_seconds != 0 {
                    cycles += 1;
                }
                candidate += ChronoDuration::seconds(cycles * base_work_seconds);
            }

            return Some(candidate);
        }

        let mut candidate;
        let mut idx;
        let mut iteration;

        match state.phase {
            TimerPhase::Work => {
                candidate = state.phase_end_time.unwrap_or_else(|| {
                    now + ChronoDuration::seconds(state.remaining_seconds.max(1) as i64)
                });
                idx = state.segment_index;
                iteration = state.segment_iteration;
            }
            TimerPhase::Break => {
                let break_end = state.phase_end_time.unwrap_or_else(|| {
                    now + ChronoDuration::seconds(state.remaining_seconds.max(1) as i64)
                });
                let next_position =
                    state.next_cycle_position(state.segment_index, state.segment_iteration);
                let work_seconds = (state.cycle_work_minutes(next_position.0) * 60) as i64;
                candidate = break_end + ChronoDuration::seconds(work_seconds);
                idx = next_position.0;
                iteration = next_position.1;
            }
            TimerPhase::Idle => unreachable!(),
        }

        while candidate < allow_break_from {
            let break_len = (state.cycle_break_minutes(idx) * 60) as i64;
            let next_position = state.next_cycle_position(idx, iteration);
            let work_len = (state.cycle_work_minutes(next_position.0) * 60) as i64;
            candidate += ChronoDuration::seconds(break_len + work_len);
            idx = next_position.0;
            iteration = next_position.1;
        }

        Some(candidate)
    }
}
