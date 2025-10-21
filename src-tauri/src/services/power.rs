use std::sync::Arc;

use super::TimerService;

/// Start monitoring display power state changes so timer pauses when the screen turns off.
pub fn start_display_power_monitor(timer: Arc<TimerService>) {
    #[cfg(windows)]
    windows_impl::start(timer);

    #[cfg(not(windows))]
    {
        let _ = timer;
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::sync::OnceLock;
    use std::thread;

    use windows::core::{w, Error, Result as WinResult};
    use windows::Win32::Foundation::{
        GetLastError, ERROR_CLASS_ALREADY_EXISTS, HANDLE, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Power::{
        RegisterPowerSettingNotification, UnregisterPowerSettingNotification, HPOWERNOTIFY,
        POWERBROADCAST_SETTING,
    };
    use windows::Win32::System::SystemServices::GUID_CONSOLE_DISPLAY_STATE;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
        PostQuitMessage, RegisterClassW, TranslateMessage, DEVICE_NOTIFY_WINDOW_HANDLE,
        HWND_MESSAGE, MSG, PBT_POWERSETTINGCHANGE, WINDOW_EX_STYLE, WINDOW_STYLE, WM_DESTROY,
        WM_POWERBROADCAST, WNDCLASSW,
    };

    static TIMER_INSTANCE: OnceLock<Arc<TimerService>> = OnceLock::new();

    pub(super) fn start(timer: Arc<TimerService>) {
        if TIMER_INSTANCE.set(timer).is_err() {
            // Already started; ignore duplicate registrations.
            return;
        }

        thread::spawn(|| {
            if let Err(err) = run_loop() {
                eprintln!("Display power monitor failed: {:?}", err);
            }
        });
    }

    fn run_loop() -> WinResult<()> {
        unsafe {
            let module = GetModuleHandleW(None)?;
            let hinstance = HINSTANCE(module.0);
            let class_name = w!("RESTY_POWER_NOTIFY");

            let wnd_class = WNDCLASSW {
                lpfnWndProc: Some(window_proc),
                hInstance: hinstance,
                lpszClassName: class_name,
                ..Default::default()
            };

            let atom = RegisterClassW(&wnd_class);
            if atom == 0 {
                let err = GetLastError();
                if err != ERROR_CLASS_ALREADY_EXISTS {
                    return Err(Error::from_win32());
                }
            }

            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                class_name,
                w!(""),
                WINDOW_STYLE::default(),
                0,
                0,
                0,
                0,
                Some(HWND_MESSAGE),
                None,
                Some(hinstance),
                None,
            )?;

            let notify = RegisterPowerSettingNotification(
                HANDLE(hwnd.0),
                &GUID_CONSOLE_DISPLAY_STATE,
                DEVICE_NOTIFY_WINDOW_HANDLE,
            )?;

            let mut msg = MSG::default();
            loop {
                let result = GetMessageW(&mut msg, None, 0, 0);
                if result.0 == -1 {
                    UnregisterPowerSettingNotification(notify)?;
                    DestroyWindow(hwnd)?;
                    return Err(Error::from_win32());
                }
                if result.0 == 0 {
                    break;
                }
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            UnregisterPowerSettingNotification(notify)?;
            DestroyWindow(hwnd)?;
        }
        Ok(())
    }

    unsafe extern "system" fn window_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match msg {
            WM_POWERBROADCAST => {
                if wparam.0 as u32 == PBT_POWERSETTINGCHANGE {
                    if let Some(timer) = TIMER_INSTANCE.get() {
                        handle_power_setting(lparam, timer);
                    }
                }
                // Return TRUE to confirm the event has been handled.
                LRESULT(1)
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                LRESULT(0)
            }
            _ => DefWindowProcW(hwnd, msg, wparam, lparam),
        }
    }

    unsafe fn handle_power_setting(lparam: LPARAM, timer: &Arc<TimerService>) {
        let setting_ptr = lparam.0 as *const POWERBROADCAST_SETTING;
        if setting_ptr.is_null() {
            return;
        }

        let setting = &*setting_ptr;
        if setting.PowerSetting != GUID_CONSOLE_DISPLAY_STATE {
            return;
        }

        if setting.DataLength < std::mem::size_of::<u32>() as u32 {
            return;
        }

        let data_slice =
            std::slice::from_raw_parts(setting.Data.as_ptr(), setting.DataLength as usize);
        if data_slice.len() < 4 {
            return;
        }

        let state =
            u32::from_le_bytes([data_slice[0], data_slice[1], data_slice[2], data_slice[3]]);
        let display_on = state != 0;

        if let Err(err) = timer.handle_display_power_state(display_on) {
            eprintln!(
                "Failed to update timer for display power state {}: {}",
                state, err
            );
        }
    }
}
