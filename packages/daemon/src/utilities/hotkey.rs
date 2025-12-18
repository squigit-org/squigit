#![cfg(not(target_os = "linux"))]

/*
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use crate::utilities::capture;
use log::{error, info};
use rdev::{Event, EventType, Key};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};

pub fn listen() {
    info!("Spatialshot Listener Started.");
    info!("Target Hotkey: Super (Cmd ⌘ /Win) + Shift + A");

    #[cfg(target_os = "macos")]
    info!("macOS Note: Ensure 'Input Monitoring' permission is granted.");

    let meta_down = Arc::new(AtomicBool::new(false));
    let shift_down = Arc::new(AtomicBool::new(false));
    let a_down = Arc::new(AtomicBool::new(false));

    let last_trigger = Arc::new(parking_lot::Mutex::new(
        Instant::now() - Duration::from_secs(10),
    ));

    let meta_ptr = meta_down.clone();
    let shift_ptr = shift_down.clone();
    let a_ptr = a_down.clone();
    let trigger_ptr = last_trigger.clone();

    let callback = move |event: Event| {
        match event.event_type {
            EventType::KeyPress(key) => match key {
                Key::MetaLeft | Key::MetaRight => meta_ptr.store(true, Ordering::SeqCst),
                Key::ShiftLeft | Key::ShiftRight => shift_ptr.store(true, Ordering::SeqCst),
                Key::KeyA => {
                    a_ptr.store(true, Ordering::SeqCst);

                    if meta_ptr.load(Ordering::SeqCst) && shift_ptr.load(Ordering::SeqCst) {
                        let mut last = trigger_ptr.lock();
                        if last.elapsed() >= Duration::from_millis(800) {
                            info!("Hotkey combination detected.");

                            std::thread::spawn(|| {
                                if let Err(e) = capture::run() {
                                    error!("Capture logic failed: {}", e);
                                }
                            });

                            *last = Instant::now();
                        }
                    }
                }
                _ => {}
            },
            EventType::KeyRelease(key) => match key {
                Key::MetaLeft | Key::MetaRight => meta_ptr.store(false, Ordering::SeqCst),
                Key::ShiftLeft | Key::ShiftRight => shift_ptr.store(false, Ordering::SeqCst),
                Key::KeyA => a_ptr.store(false, Ordering::SeqCst),
                _ => {}
            },
            _ => {}
        }
    };

    if let Err(error) = rdev::listen(callback) {
        error!("Global listener error: {:?}", error);
    }
}
