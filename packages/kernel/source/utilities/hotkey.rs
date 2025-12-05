use crate::utilities::capture;
use log::{error, info};
use rdev::{Event, EventType, Key};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};

/// This function contains the hotkey listening logic from the original hotkey package.
pub fn listen() {
    // 1. Initialize Logging (Silent by default unless env var set)
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    info!("Spatialshot Listener Started.");
    info!("Target Hotkey: Super (Cmd/Win) + Shift + A");

    #[cfg(target_os = "macos")]
    info!("macOS Note: Ensure 'Input Monitoring' permission is granted.");

    // 2. State Management (Atomic for thread safety in hooks)
    let meta_down = Arc::new(AtomicBool::new(false)); // Windows Key / Command Key
    let shift_down = Arc::new(AtomicBool::new(false)); // Shift
    let a_down = Arc::new(AtomicBool::new(false)); // The 'A' key

    // 3. Debouncing (Prevent spam-launching)
    let last_trigger = Arc::new(parking_lot::Mutex::new(
        Instant::now() - Duration::from_secs(10),
    ));

    // Clones for the closure
    let meta_ptr = meta_down.clone();
    let shift_ptr = shift_down.clone();
    let a_ptr = a_down.clone();
    let trigger_ptr = last_trigger.clone();

    // 4. The Global Hook Callback
    let callback = move |event: Event| {
        match event.event_type {
            EventType::KeyPress(key) => match key {
                // Handle Left/Right variations for robustness
                Key::MetaLeft | Key::MetaRight => meta_ptr.store(true, Ordering::SeqCst),
                Key::ShiftLeft | Key::ShiftRight => shift_ptr.store(true, Ordering::SeqCst),
                Key::KeyA => {
                    a_ptr.store(true, Ordering::SeqCst);

                    // CHECK CONDITION
                    if meta_ptr.load(Ordering::SeqCst) && shift_ptr.load(Ordering::SeqCst) {
                        let mut last = trigger_ptr.lock();
                        // 800ms debounce
                        if last.elapsed() >= Duration::from_millis(800) {
                            info!("Hotkey combination detected.");

                            // Run the kernel logic in a separate thread to avoid blocking the listener
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
            _ => {} // Ignore mouse move, scroll, etc.
        }
    };

    // 5. Start Listening (Blocking)
    if let Err(error) = rdev::listen(callback) {
        error!("Global listener error: {:?}", error);
    }
}
