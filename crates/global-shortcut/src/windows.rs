// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::ShortcutConfig;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, HOT_KEY_MODIFIERS,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetMessageW, PostThreadMessageW, MSG, WM_HOTKEY, WM_QUIT,
};

const HOTKEY_ID: i32 = 0x7001;

pub(crate) struct WindowsHandle {
    thread_id: u32,

    shutdown: Arc<AtomicBool>,

    _thread: std::thread::JoinHandle<()>,
}

impl WindowsHandle {
    pub fn register<F>(config: ShortcutConfig, callback: F) -> Result<Self, String>
    where
        F: Fn() + Send + Sync + 'static,
    {
        let shutdown = Arc::new(AtomicBool::new(false));
        let shutdown_clone = shutdown.clone();
        let callback = Arc::new(callback);

        let (tx, rx) = std::sync::mpsc::channel::<Result<u32, String>>();

        let thread = std::thread::Builder::new()
            .name("global-shortcut-windows".into())
            .spawn(move || {
                let thread_id = unsafe { windows::Win32::System::Threading::GetCurrentThreadId() };

                let modifiers = HOT_KEY_MODIFIERS(config.windows_modifiers as u32);
                let result = unsafe {
                    RegisterHotKey(HWND::default(), HOTKEY_ID, modifiers, config.windows_vk)
                };

                if let Err(e) = result {
                    let _ = tx.send(Err(format!("RegisterHotKey failed: {}", e)));
                    return;
                }

                let _ = tx.send(Ok(thread_id));

                let mut msg = MSG::default();
                loop {
                    let ret = unsafe { GetMessageW(&mut msg, HWND::default(), 0, 0) };

                    if !ret.as_bool() || shutdown_clone.load(Ordering::SeqCst) {
                        break;
                    }

                    if msg.message == WM_HOTKEY && msg.wParam.0 as i32 == HOTKEY_ID {
                        log::debug!("Global shortcut activated (Windows)");
                        callback();
                    }
                }

                unsafe {
                    let _ = UnregisterHotKey(HWND::default(), HOTKEY_ID);
                }
                log::info!("Windows global shortcut listener exited");
            })
            .map_err(|e| format!("Failed to spawn shortcut thread: {}", e))?;

        let thread_id = rx
            .recv()
            .map_err(|_| "Shortcut thread died before registration".to_string())?
            .map_err(|e| e)?;

        Ok(Self {
            thread_id,
            shutdown,
            _thread: thread,
        })
    }

    pub fn unregister(self) {
        self.shutdown.store(true, Ordering::SeqCst);

        unsafe {
            let _ = PostThreadMessageW(self.thread_id, WM_QUIT, None, None);
        }
    }
}
