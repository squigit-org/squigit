/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */
use crate::utilities::launcher::ENGINE_PID;
use std::process::Command;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;

pub fn start_monitor() {
    thread::spawn(move || {
        let mut last_count = get_monitor_count();

        loop {
            thread::sleep(Duration::from_millis(500));
            let current_count = get_monitor_count();

            if current_count != last_count {
                emergency_shutdown();
            }
            last_count = current_count;
        }
    });
}

fn emergency_shutdown() {
    // 1. Kill the Engine if it is running
    let pid = ENGINE_PID.load(Ordering::SeqCst);
    if pid != 0 {
        let _ = kill_process(pid);
    }

    // 2. Kill the Kernel (Self)
    std::process::exit(1);
}

#[cfg(target_os = "windows")]
fn get_monitor_count() -> i32 {
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CMONITORS};
    unsafe { GetSystemMetrics(SM_CMONITORS) }
}

#[cfg(not(target_os = "windows"))]
fn get_monitor_count() -> i32 {
    // Basic heuristics for Unix-like systems
    if cfg!(target_os = "macos") {
        // Use system_profiler to count graphics displays
        let output = Command::new("system_profiler")
            .arg("SPDisplaysDataType")
            .output()
            .ok();

        if let Some(out) = output {
            let str_out = String::from_utf8_lossy(&out.stdout);
            // Count occurrences of "Resolution:" as a proxy for connected displays
            return str_out.matches("Resolution:").count() as i32;
        }
    } else {
        // Linux: Try xrandr
        let output = Command::new("xrandr").arg("--listmonitors").output().ok();

        if let Some(out) = output {
            let str_out = String::from_utf8_lossy(&out.stdout);
            // First line is metadata, subsequent lines are monitors
            return str_out.lines().count() as i32 - 1;
        }
    }
    1 // Fallback if detection fails
}

fn kill_process(pid: u32) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        Command::new("taskkill")
            .args(&["/F", "/PID", &pid.to_string()])
            .output()?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .output()?;
    }
    Ok(())
}
