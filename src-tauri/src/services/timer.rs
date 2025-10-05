use crate::models::{TimerPhase, TimerState, TimerInfo, Session, SessionType};
use crate::utils::AppResult;
use chrono::Utc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::time;
use uuid::Uuid;

/// Timer service for managing work/break cycles
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
}

impl TimerService {
    /// Create a new timer service
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
            })),
            app,
        })
    }

    /// Start work session
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
    pub fn skip(&self) -> AppResult<Session> {
        let state = self.state.lock().unwrap();
        let session = self.create_session_record(&state, true);
        drop(state);

        self.stop()?;
        Ok(session)
    }

    /// Extend current phase by seconds
    pub fn extend(&self, seconds: u32) -> AppResult<()> {
        let mut state = self.state.lock().unwrap();
        state.remaining_seconds += seconds;
        state.total_seconds += seconds;
        drop(state);
        self.emit_timer_update()?;
        Ok(())
    }

    /// Stop timer
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
    pub fn tick(&self) -> AppResult<Option<Session>> {
        let mut state = self.state.lock().unwrap();

        if state.state != TimerState::Running {
            return Ok(None);
        }

        let now = Instant::now();
        let elapsed = now.duration_since(state.last_tick).as_secs() as u32;
        state.last_tick = now;

        if state.remaining_seconds > 0 {
            state.remaining_seconds = state.remaining_seconds.saturating_sub(elapsed);
        }

        let timer_finished = state.remaining_seconds == 0;
        let session = if timer_finished {
            Some(self.create_session_record(&state, false))
        } else {
            None
        };

        drop(state);
        self.emit_timer_update()?;

        if timer_finished {
            self.emit_timer_finished()?;
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
    fn emit_timer_update(&self) -> AppResult<()> {
        let info = self.get_info();
        self.app
            .emit("timer-update", info)
            .map_err(|e| crate::utils::AppError::TauriError(e.to_string()))?;
        Ok(())
    }

    /// Emit phase change event
    fn emit_phase_change(&self, phase: &str) -> AppResult<()> {
        self.app
            .emit("phase-change", phase)
            .map_err(|e| crate::utils::AppError::TauriError(e.to_string()))?;
        Ok(())
    }

    /// Emit timer finished event
    fn emit_timer_finished(&self) -> AppResult<()> {
        self.app
            .emit("timer-finished", ())
            .map_err(|e| crate::utils::AppError::TauriError(e.to_string()))?;
        Ok(())
    }

    /// Start background ticker
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
