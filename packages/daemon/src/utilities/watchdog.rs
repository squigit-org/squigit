/*
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use crate::utilities::launcher::CAPTURE_PID;
use std::process::Command;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;

pub fn start_monitor() {
    thread::spawn(move || {
        let mut last_count = get_monitor_count();
        loop {
            thread::sleep(Duration::from_millis(1000));
            let current_pid = CAPTURE_PID.load(Ordering::SeqCst);
            if current_pid == 0 {
                return;
            }

            let current_count = get_monitor_count();

            if current_count != last_count {
                log::warn!("Display change detected! Kill switch engaged.");
                emergency_shutdown();
                return;
            }
            last_count = current_count;
        }
    });
}

fn emergency_shutdown() {
    let pid = CAPTURE_PID.load(Ordering::SeqCst);
    if pid != 0 {
        let _ = kill_process(pid);
    }

    #[cfg(target_os = "linux")]
    std::process::exit(1);
}

#[cfg(target_os = "macos")]
fn get_monitor_count() -> i32 {
    use core_graphics::display::CGDisplay;
    match CGDisplay::active_displays() {
        Ok(d) => d.len() as i32,
        Err(_) => 1,
    }
}

#[cfg(all(target_os = "linux"))]
fn get_monitor_count() -> i32 {
    let output = Command::new("xrandr").arg("--listmonitors").output().ok();
    if let Some(out) = output {
        String::from_utf8_lossy(&out.stdout).lines().count() as i32 - 1
    } else {
        1
    }
}

#[cfg(target_os = "windows")]
fn get_monitor_count() -> i32 {
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CMONITORS};
    unsafe { GetSystemMetrics(SM_CMONITORS) }
}

fn kill_process(pid: u32) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        let _ = Command::new("kill").arg(pid.to_string()).output();
        thread::sleep(Duration::from_millis(100));
        Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .output()?;
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        Command::new("taskkill")
            .args(&["/F", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output()?;
    }
    Ok(())
}
