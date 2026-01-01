use std::sync::Arc;

use super::TimerService;

/// Start monitoring power state changes (display off, system suspend/resume).
/// This ensures the timer pauses when the screen turns off or system hibernates,
/// and restarts work when the system wakes up.
pub fn start_display_power_monitor(timer: Arc<TimerService>) {
    #[cfg(windows)]
    windows_impl::start(timer.clone());

    #[cfg(target_os = "macos")]
    macos_impl::start(timer.clone());

    #[cfg(target_os = "linux")]
    linux_impl::start(timer.clone());

    #[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
    {
        let _ = timer;
    }
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::sync::OnceLock;
    use std::thread;

    use windows::core::{w, Error, Result as WinResult, GUID};
    use windows::Win32::Foundation::{
        GetLastError, ERROR_CLASS_ALREADY_EXISTS, HANDLE, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM,
    };
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::System::Power::{
        RegisterPowerSettingNotification, UnregisterPowerSettingNotification,
        POWERBROADCAST_SETTING,
    };
    use windows::Win32::System::SystemServices::GUID_CONSOLE_DISPLAY_STATE;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
        PostQuitMessage, RegisterClassW, TranslateMessage, DEVICE_NOTIFY_WINDOW_HANDLE,
        HWND_MESSAGE, MSG, PBT_APMRESUMEAUTOMATIC, PBT_APMRESUMESUSPEND, PBT_APMSUSPEND,
        PBT_POWERSETTINGCHANGE, WINDOW_EX_STYLE, WINDOW_STYLE, WM_DESTROY, WM_POWERBROADCAST,
        WNDCLASSW,
    };

    // GUID for system suspend/resume power setting notifications
    // {5d3e9a59-e9D5-4b00-a6bd-ff34ff516548}
    const GUID_SYSTEM_AWAYMODE: GUID = GUID::from_u128(0x98a7f580_01f7_48aa_9c0f_44352c29e5c0);

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

            // Also register for system away mode (connected standby) notifications
            let notify_away = RegisterPowerSettingNotification(
                HANDLE(hwnd.0),
                &GUID_SYSTEM_AWAYMODE,
                DEVICE_NOTIFY_WINDOW_HANDLE,
            );

            let mut msg = MSG::default();
            loop {
                let result = GetMessageW(&mut msg, None, 0, 0);
                if result.0 == -1 {
                    UnregisterPowerSettingNotification(notify)?;
                    if let Ok(h) = notify_away {
                        let _ = UnregisterPowerSettingNotification(h);
                    }
                    DestroyWindow(hwnd)?;
                    return Err(Error::from_win32());
                }
                if result.0 == 0 {
                    break;
                }
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }

            UnregisterPowerSettingNotification(notify)?;
            if let Ok(h) = notify_away {
                let _ = UnregisterPowerSettingNotification(h);
            }
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
                if let Some(timer) = TIMER_INSTANCE.get() {
                    let wparam_val = wparam.0 as u32;
                    match wparam_val {
                        PBT_POWERSETTINGCHANGE => {
                            handle_power_setting(lparam, timer);
                        }
                        PBT_APMSUSPEND => {
                            // System is about to suspend/hibernate
                            // Pause the timer to prevent time drift
                            eprintln!("[Power] System suspending, pausing timer");
                            if let Err(err) = timer.handle_system_suspend() {
                                eprintln!("Failed to handle system suspend: {}", err);
                            }
                        }
                        PBT_APMRESUMEAUTOMATIC | PBT_APMRESUMESUSPEND => {
                            // System resumed from suspend/hibernate
                            // Restart work timer after resume
                            eprintln!("[Power] System resumed, restarting work timer");
                            if let Err(err) = timer.handle_system_resume() {
                                eprintln!("Failed to handle system resume: {}", err);
                            }
                        }
                        _ => {}
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

#[cfg(target_os = "macos")]
mod macos_impl {
    use super::*;
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSAutoreleasePool, NSString};
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object, Sel};
    use objc::{class, msg_send, sel, sel_impl};
    use std::sync::OnceLock;

    const SCREEN_DID_SLEEP: &str = "NSWorkspaceScreensDidSleepNotification";
    const SCREEN_DID_WAKE: &str = "NSWorkspaceScreensDidWakeNotification";
    const SYSTEM_WILL_SLEEP: &str = "NSWorkspaceWillSleepNotification";
    const SYSTEM_DID_WAKE: &str = "NSWorkspaceDidWakeNotification";

    struct ObserverHandle(id);

    unsafe impl Send for ObserverHandle {}
    unsafe impl Sync for ObserverHandle {}

    static TIMER_INSTANCE: OnceLock<Arc<TimerService>> = OnceLock::new();
    static OBSERVER_CLASS: OnceLock<&'static Class> = OnceLock::new();
    static OBSERVER_INSTANCE: OnceLock<ObserverHandle> = OnceLock::new();

    pub(super) fn start(timer: Arc<TimerService>) {
        if TIMER_INSTANCE.set(timer).is_err() {
            // Already started; ignore duplicate registrations.
            return;
        }

        unsafe {
            let _pool = NSAutoreleasePool::new(nil);
            let observer_class = OBSERVER_CLASS.get_or_init(register_observer_class);
            let observer: id = msg_send![*observer_class, new];
            let workspace_class = class!(NSWorkspace);
            let workspace: id = msg_send![workspace_class, sharedWorkspace];
            let center: id = msg_send![workspace, notificationCenter];

            add_observer(center, observer, sel!(screenDidSleep:), SCREEN_DID_SLEEP);
            add_observer(center, observer, sel!(screenDidWake:), SCREEN_DID_WAKE);
            add_observer(center, observer, sel!(systemWillSleep:), SYSTEM_WILL_SLEEP);
            add_observer(center, observer, sel!(systemDidWake:), SYSTEM_DID_WAKE);

            let _ = OBSERVER_INSTANCE.set(ObserverHandle(observer));
        }
    }

    fn register_observer_class() -> &'static Class {
        if let Some(existing) = Class::get("RestyPowerObserver") {
            return existing;
        }

        let superclass = class!(NSObject);
        let mut decl =
            ClassDecl::new("RestyPowerObserver", superclass).expect("Unable to register observer");
        unsafe {
            decl.add_method(
                sel!(screenDidSleep:),
                screen_did_sleep as extern "C" fn(&Object, Sel, id),
            );
            decl.add_method(
                sel!(screenDidWake:),
                screen_did_wake as extern "C" fn(&Object, Sel, id),
            );
            decl.add_method(
                sel!(systemWillSleep:),
                system_will_sleep as extern "C" fn(&Object, Sel, id),
            );
            decl.add_method(
                sel!(systemDidWake:),
                system_did_wake as extern "C" fn(&Object, Sel, id),
            );
        }
        decl.register()
    }

    unsafe fn add_observer(center: id, observer: id, selector: Sel, name: &str) {
        let ns_name = NSString::alloc(nil).init_str(name);
        let _: () = msg_send![center, addObserver: observer selector: selector name: ns_name object: nil];
    }

    extern "C" fn screen_did_sleep(_: &Object, _: Sel, _: id) {
        if let Some(timer) = TIMER_INSTANCE.get() {
            eprintln!("[Power] Screen sleeping, pausing timer");
            if let Err(err) = timer.handle_display_power_state(false) {
                eprintln!("Failed to handle screen sleep: {}", err);
            }
        }
    }

    extern "C" fn screen_did_wake(_: &Object, _: Sel, _: id) {
        if let Some(timer) = TIMER_INSTANCE.get() {
            eprintln!("[Power] Screen woke, restarting work timer");
            if let Err(err) = timer.handle_display_power_state(true) {
                eprintln!("Failed to handle screen wake: {}", err);
            }
        }
    }

    extern "C" fn system_will_sleep(_: &Object, _: Sel, _: id) {
        if let Some(timer) = TIMER_INSTANCE.get() {
            eprintln!("[Power] System sleeping, pausing timer");
            if let Err(err) = timer.handle_system_suspend() {
                eprintln!("Failed to handle system sleep: {}", err);
            }
        }
    }

    extern "C" fn system_did_wake(_: &Object, _: Sel, _: id) {
        if let Some(timer) = TIMER_INSTANCE.get() {
            eprintln!("[Power] System woke, restarting work timer");
            if let Err(err) = timer.handle_system_resume() {
                eprintln!("Failed to handle system wake: {}", err);
            }
        }
    }
}

#[cfg(target_os = "linux")]
mod linux_impl {
    use super::*;
    use futures_util::StreamExt;
    use std::sync::OnceLock;
    use tauri::async_runtime::spawn;
    use zbus::{Connection, Proxy};

    static TIMER_INSTANCE: OnceLock<Arc<TimerService>> = OnceLock::new();

    pub(super) fn start(timer: Arc<TimerService>) {
        if TIMER_INSTANCE.set(timer.clone()).is_err() {
            // Already started; ignore duplicate registrations.
            return;
        }

        spawn(async move {
            if let Err(err) = monitor_power(timer).await {
                eprintln!("Linux power monitor failed: {}", err);
            }
        });
    }

    async fn monitor_power(timer: Arc<TimerService>) -> zbus::Result<()> {
        let connection = Connection::system().await?;
        let login_proxy = Proxy::new(
            &connection,
            "org.freedesktop.login1",
            "/org/freedesktop/login1",
            "org.freedesktop.login1.Manager",
        )
        .await?;
        let mut sleep_stream = login_proxy.receive_signal("PrepareForSleep").await?;

        let screensaver_proxy = Proxy::new(
            &connection,
            "org.freedesktop.ScreenSaver",
            "/org/freedesktop/ScreenSaver",
            "org.freedesktop.ScreenSaver",
        )
        .await;

        match screensaver_proxy {
            Ok(proxy) => {
                let mut screen_stream = proxy.receive_signal("ActiveChanged").await?;
                loop {
                    tokio::select! {
                        maybe_msg = sleep_stream.next() => {
                            if let Some(msg) = maybe_msg {
                                handle_sleep_signal(&timer, msg)?;
                            } else {
                                break;
                            }
                        }
                        maybe_msg = screen_stream.next() => {
                            if let Some(msg) = maybe_msg {
                                handle_screen_signal(&timer, msg)?;
                            }
                        }
                    }
                }
            }
            Err(err) => {
                eprintln!("ScreenSaver DBus unavailable: {}", err);
                while let Some(msg) = sleep_stream.next().await {
                    handle_sleep_signal(&timer, msg)?;
                }
            }
        }

        Ok(())
    }

    fn handle_sleep_signal(
        timer: &Arc<TimerService>,
        msg: zbus::Message,
    ) -> zbus::Result<()> {
        if let Ok((sleeping,)) = msg.body().deserialize::<(bool,)>() {
            if sleeping {
                eprintln!("[Power] System suspending, pausing timer");
                if let Err(err) = timer.handle_system_suspend() {
                    eprintln!("Failed to handle system suspend: {}", err);
                }
            } else {
                eprintln!("[Power] System resumed, restarting work timer");
                if let Err(err) = timer.handle_system_resume() {
                    eprintln!("Failed to handle system resume: {}", err);
                }
            }
        }
        Ok(())
    }

    fn handle_screen_signal(
        timer: &Arc<TimerService>,
        msg: zbus::Message,
    ) -> zbus::Result<()> {
        if let Ok((active,)) = msg.body().deserialize::<(bool,)>() {
            if active {
                eprintln!("[Power] Screen saver active, pausing timer");
                if let Err(err) = timer.handle_display_power_state(false) {
                    eprintln!("Failed to handle screen sleep: {}", err);
                }
            } else {
                eprintln!("[Power] Screen saver inactive, restarting work timer");
                if let Err(err) = timer.handle_display_power_state(true) {
                    eprintln!("Failed to handle screen wake: {}", err);
                }
            }
        }
        Ok(())
    }
}
