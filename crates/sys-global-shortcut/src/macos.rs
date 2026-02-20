// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! macOS backend: `RegisterEventHotKey` via Carbon FFI.
//!
//! Flow:
//! 1. InstallEventHandler for kEventHotKeyPressed
//! 2. RegisterEventHotKey(keycode, modifiers, id)
//! 3. Carbon event dispatch → callback fires
//! 4. UnregisterEventHotKey + RemoveEventHandler on unregister()
//!
//! Uses raw `extern "C"` FFI — no external crate dependencies.

use crate::ShortcutConfig;
use std::ffi::c_void;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

// ── Carbon / Core Services FFI bindings ──

type OSStatus = i32;
type OSType = u32;
type EventTargetRef = *mut c_void;
type EventHandlerRef = *mut c_void;
type EventHandlerCallRef = *mut c_void;
type EventRef = *mut c_void;
type EventHotKeyRef = *mut c_void;
type EventHandlerProcPtr =
    unsafe extern "C" fn(EventHandlerCallRef, EventRef, *mut c_void) -> OSStatus;

#[repr(C)]
#[derive(Copy, Clone)]
struct EventTypeSpec {
    event_class: OSType,
    event_kind: u32,
}

#[repr(C)]
#[derive(Copy, Clone)]
struct EventHotKeyID {
    signature: OSType,
    id: u32,
}

const NO_ERR: OSStatus = 0;

/// kEventClassKeyboard = 'keyb'
const K_EVENT_CLASS_KEYBOARD: OSType =
    ((b'k' as u32) << 24) | ((b'e' as u32) << 16) | ((b'y' as u32) << 8) | (b'b' as u32);

/// kEventHotKeyPressed = 5
const K_EVENT_HOT_KEY_PRESSED: u32 = 5;

/// Our signature: 'SNLM'
const HOTKEY_SIGNATURE: OSType =
    ((b'S' as u32) << 24) | ((b'N' as u32) << 16) | ((b'L' as u32) << 8) | (b'M' as u32);

extern "C" {
    fn GetApplicationEventTarget() -> EventTargetRef;
    fn InstallEventHandler(
        target: EventTargetRef,
        handler: EventHandlerProcPtr,
        num_types: u32,
        list: *const EventTypeSpec,
        user_data: *mut c_void,
        out_ref: *mut EventHandlerRef,
    ) -> OSStatus;
    fn RemoveEventHandler(handler: EventHandlerRef) -> OSStatus;
    fn RegisterEventHotKey(
        hot_key_code: u32,
        hot_key_modifiers: u32,
        hot_key_id: EventHotKeyID,
        target: EventTargetRef,
        options: u32, // 0
        out_ref: *mut EventHotKeyRef,
    ) -> OSStatus;
    fn UnregisterEventHotKey(hot_key: EventHotKeyRef) -> OSStatus;
    fn RunApplicationEventLoop();
    fn QuitApplicationEventLoop();
}

/// Stored in a Box and passed as user_data to the Carbon event handler.
struct HotkeyContext {
    callback: Arc<dyn Fn() + Send + Sync>,
}

unsafe extern "C" fn hotkey_handler(
    _call_ref: EventHandlerCallRef,
    _event: EventRef,
    user_data: *mut c_void,
) -> OSStatus {
    let ctx = &*(user_data as *const HotkeyContext);
    log::debug!("Global shortcut activated (macOS)");
    (ctx.callback)();
    NO_ERR
}

pub(crate) struct MacosHandle {
    shutdown: Arc<AtomicBool>,
    _thread: std::thread::JoinHandle<()>,
}

impl MacosHandle {
    pub fn register<F>(config: ShortcutConfig, callback: F) -> Result<Self, String>
    where
        F: Fn() + Send + Sync + 'static,
    {
        let shutdown = Arc::new(AtomicBool::new(false));
        let callback = Arc::new(callback);

        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();

        let keycode = config.macos_keycode;
        let modifiers = config.macos_modifiers;

        let thread = std::thread::Builder::new()
            .name("global-shortcut-macos".into())
            .spawn(move || {
                unsafe {
                    let target = GetApplicationEventTarget();

                    let event_type = EventTypeSpec {
                        event_class: K_EVENT_CLASS_KEYBOARD,
                        event_kind: K_EVENT_HOT_KEY_PRESSED,
                    };

                    let ctx = Box::new(HotkeyContext { callback });
                    let ctx_ptr = Box::into_raw(ctx) as *mut c_void;

                    let mut handler_ref: EventHandlerRef = std::ptr::null_mut();
                    let status = InstallEventHandler(
                        target,
                        hotkey_handler,
                        1,
                        &event_type,
                        ctx_ptr,
                        &mut handler_ref,
                    );

                    if status != NO_ERR {
                        // Reclaim the context
                        let _ = Box::from_raw(ctx_ptr as *mut HotkeyContext);
                        let _ = tx.send(Err(format!(
                            "InstallEventHandler failed (OSStatus {})",
                            status
                        )));
                        return;
                    }

                    let hotkey_id = EventHotKeyID {
                        signature: HOTKEY_SIGNATURE,
                        id: 1,
                    };

                    let mut hotkey_ref: EventHotKeyRef = std::ptr::null_mut();
                    let status = RegisterEventHotKey(
                        keycode,
                        modifiers,
                        hotkey_id,
                        target,
                        0,
                        &mut hotkey_ref,
                    );

                    if status != NO_ERR {
                        RemoveEventHandler(handler_ref);
                        let _ = Box::from_raw(ctx_ptr as *mut HotkeyContext);
                        let _ = tx.send(Err(format!(
                            "RegisterEventHotKey failed (OSStatus {})",
                            status
                        )));
                        return;
                    }

                    let _ = tx.send(Ok(()));

                    log::info!("macOS global shortcut registered, entering event loop");

                    // Blocking — runs until QuitApplicationEventLoop() is called
                    RunApplicationEventLoop();

                    // Cleanup
                    UnregisterEventHotKey(hotkey_ref);
                    RemoveEventHandler(handler_ref);
                    let _ = Box::from_raw(ctx_ptr as *mut HotkeyContext);

                    log::info!("macOS global shortcut listener exited");
                }
            })
            .map_err(|e| format!("Failed to spawn shortcut thread: {}", e))?;

        // Wait for registration result
        rx.recv()
            .map_err(|_| "Shortcut thread died before registration".to_string())?
            .map_err(|e| e)?;

        Ok(Self {
            shutdown,
            _thread: thread,
        })
    }

    pub fn unregister(self) {
        self.shutdown.store(true, Ordering::SeqCst);
        unsafe {
            QuitApplicationEventLoop();
        }
    }
}
