// src/sys/mod.rs

pub mod audio;
pub mod hotkey;
pub mod monitors;

use std::sync::atomic::{AtomicU32, Ordering};

/// Global PID of the currently running C++ capture engine.
/// Used by MonitorGuard to kill the specific process if screens change.
pub static CAPTURE_PID: AtomicU32 = AtomicU32::new(0);

pub fn set_capture_pid(pid: u32) {
    let old_pid = CAPTURE_PID.swap(pid, Ordering::SeqCst);
    
    // Clean up any old process that might still be lingering
    // This prevents zombie processes if the daemon logic got confused
    if old_pid != 0 && old_pid != pid {
        let _ = monitors::kill_process(old_pid);
    }
}

pub fn get_capture_pid() -> u32 {
    CAPTURE_PID.load(Ordering::SeqCst)
}
