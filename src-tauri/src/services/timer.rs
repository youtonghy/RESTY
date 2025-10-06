use crate::models::{TimerPhase, TimerState, TimerInfo, Session, SessionType};
use crate::utils::AppResult;
use chrono::Utc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::time;
use uuid::Uuid;

/// Timer service for managing work/break cycles.
/// 负责管理工作/休息阶段状态与事件广播。
pub struct TimerService {
    state: Arc<Mutex<TimerServiceState>>,
    app: AppHandle,
}

struct TimerServiceState {
    phase: TimerPhase,
    state: TimerState,
    remaining_seconds: u32,
    total_seconds: u32,
    work_duration: u32,
    break_duration: u32,
    last_tick: Instant,
    current_session_id: Option<String>,
    current_session_start: Option<chrono::DateTime<Utc>>,
    auto_cycle: bool, // Auto cycle between work and break
}

impl TimerService {
    /// Create a new timer service
    /// 初始化服务，记录工作/休息时长并保留 AppHandle。
    pub fn new(app: AppHandle, work_duration: u32, break_duration: u32) -> Arc<Self> {
        Arc::new(Self {
            state: Arc::new(Mutex::new(TimerServiceState {
                phase: TimerPhase::Idle,
                state: TimerState::Stopped,
                remaining_seconds: 0,
                total_seconds: 0,
                work_duration,
                break_duration,
                last_tick: Instant::now(),
                current_session_id: None,
                current_session_start: None,
                auto_cycle: true, // Enable auto cycle by default
            })),
            app,
        })
    }

    /// Start work session
    /// 切换到工作阶段并重置计时。
    pub fn start_work(&self) -> AppResult<()> {
        let mut state = self.state.lock().unwrap();
        state.phase = TimerPhase::Work;
        state.state = TimerState::Running;
        state.total_seconds = state.work_duration * 60;
        state.remaining_seconds = state.total_seconds;
        state.last_tick = Instant::now();
        state.current_session_id = Some(Uuid::new_v4().to_string());
        state.current_session_start = Some(Utc::now());
        drop(state);

        self.emit_timer_update()?;
        self.emit_phase_change("work")?;
        Ok(())
    }

    /// Start break session
    /// 切换到休息阶段并重置计时。
    pub fn start_break(&self) -> AppResult<()> {
        let mut state = self.state.lock().unwrap();
        state.phase = TimerPhase::Break;
        state.state = TimerState::Running;
        state.total_seconds = state.break_duration * 60;
        state.remaining_seconds = state.total_seconds;
        state.last_tick = Instant::now();
        state.current_session_id = Some(Uuid::new_v4().to_string());
        state.current_session_start = Some(Utc::now());
        drop(state);

        self.emit_timer_update()?;
        self.emit_phase_change("break")?;
        Ok(())
    }

    /// Pause timer
    /// 将计时器状态标记为暂停，不再递减剩余时间。
    pub fn pause(&self) -> AppResult<()> {
        let mut state = self.state.lock().unwrap();
        if state.state == TimerState::Running {
            state.state = TimerState::Paused;
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
            state.last_tick = Instant::now();
            drop(state);
            self.emit_timer_update()?;
        }
        Ok(())
    }

    /// Skip current phase
    /// 终止当前阶段并生成会话记录，返回给上层持久化。
    pub fn skip(&self) -> AppResult<Session> {
        let state = self.state.lock().unwrap();
        let previous_phase = state.phase.clone();
        let session = self.create_session_record(&state, true);
        drop(state);

        self.stop()?;

        match previous_phase {
            TimerPhase::Work => {
                // Skipping work should immediately begin the break phase
                self.start_break()?;
                self.show_break_reminder()?;
            }
            TimerPhase::Break => {
                // Skipping break returns to the next work session
                self.start_work()?;
            }
            TimerPhase::Idle => {}
        }

        Ok(session)
    }

    /// Extend current phase by seconds
    /// 延长当前阶段剩余时长，并通知前端刷新进度。
    pub fn extend(&self, seconds: u32) -> AppResult<()> {
        let mut state = self.state.lock().unwrap();
        state.remaining_seconds += seconds;
        state.total_seconds += seconds;
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
        state.current_session_id = None;
        state.current_session_start = None;
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

        let now = Instant::now();
        let elapsed = now.duration_since(state.last_tick).as_secs() as u32;

        if state.remaining_seconds > 0 {
            state.remaining_seconds = state.remaining_seconds.saturating_sub(elapsed);
        }

        let timer_finished = state.remaining_seconds == 0;
        let session = if timer_finished {
            Some(self.create_session_record(&state, false))
        } else {
            None
        };

        // Check if auto-cycle is enabled and timer finished
        let should_auto_cycle = timer_finished && state.auto_cycle;
        let next_phase = state.phase.clone();

        // Update last_tick AFTER all calculations are done
        state.last_tick = now;

        drop(state);
        self.emit_timer_update()?;

        if timer_finished {
            self.emit_timer_finished()?;

            // Auto-cycle to next phase
            if should_auto_cycle {
                match next_phase {
                    TimerPhase::Work => {
                        // Work finished, start break and show reminder
                        self.start_break()?;
                        self.show_break_reminder()?;
                    }
                    TimerPhase::Break => {
                        // Break finished, start work
                        self.start_work()?;
                    }
                    TimerPhase::Idle => {}
                }
            }
        }

        Ok(session)
    }

    /// Get current timer info
    pub fn get_info(&self) -> TimerInfo {
        let state = self.state.lock().unwrap();
        TimerInfo {
            phase: state.phase.clone(),
            state: state.state.clone(),
            remaining_seconds: state.remaining_seconds,
            total_seconds: state.total_seconds,
        }
    }

    /// Update durations
    pub fn update_durations(&self, work_duration: u32, break_duration: u32) {
        let mut state = self.state.lock().unwrap();
        state.work_duration = work_duration;
        state.break_duration = break_duration;
    }

    /// Create session record from current state
    fn create_session_record(&self, state: &TimerServiceState, is_skipped: bool) -> Session {
        let end_time = Utc::now();
        let start_time = state.current_session_start.unwrap_or(end_time);
        let actual_duration = (end_time - start_time).num_seconds();

        Session {
            id: state.current_session_id.clone().unwrap_or_else(|| Uuid::new_v4().to_string()),
            session_type: match state.phase {
                TimerPhase::Work => SessionType::Work,
                TimerPhase::Break => SessionType::Break,
                TimerPhase::Idle => SessionType::Work,
            },
            start_time,
            end_time,
            duration: actual_duration,
            planned_duration: (state.total_seconds as i64),
            is_skipped,
            extended_seconds: 0,
            notes: None,
        }
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
            let mut interval = time::interval(Duration::from_secs(1));
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
