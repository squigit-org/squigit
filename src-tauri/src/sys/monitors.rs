// src/sys/monitors.rs

use crate::sys::get_capture_pid;
use std::process::Command;
use std::thread;
use std::time::Duration;

pub fn start_monitor() {
    thread::spawn(move || {
        let mut last_count = get_monitor_count();
        loop {
            thread::sleep(Duration::from_millis(500));

            let pid = get_capture_pid();
            if pid == 0 {
                // No capture running, just update count and wait
                last_count = get_monitor_count();
                continue;
            }

            let current_count = get_monitor_count();
            if current_count != last_count {
                // Debounce: wait to see if it stabilizes
                thread::sleep(Duration::from_millis(800));
                let confirm_count = get_monitor_count();
                if confirm_count != current_count {
                    // Still changing, update and ignore
                    last_count = confirm_count;
                    continue;
                }
                
                // Real change detected
                log::warn!(
                    "Display topology changed ({} -> {}). Emergency Shutdown.",
                    last_count,
                    current_count
                );
                emergency_shutdown(pid);
                return;
            }
        }
    });
}

fn emergency_shutdown(pid: u32) {
    let _ = kill_process(pid);
    // REMOVED: std::process::exit(1); 
    // REASON: Exiting here bypasses AudioGuard drop in main thread. 
    // By just killing the child, main.rs will wake up from wait(), 
    // handle the error, and drop AudioGuard naturally.
    log::warn!("Killed capture process due to monitor topology change.");
}

pub(crate) fn kill_process(pid: u32) -> std::io::Result<()> {
    if pid == 0 { return Ok(()); }
    
    #[cfg(unix)]
    {
        // 1. Try SIGTERM (15) - Polite
        let _ = Command::new("kill").arg("-15").arg(pid.to_string()).output();
        
        // 2. Give it a moment to die
        thread::sleep(Duration::from_millis(200));

        // 3. Check if still alive (signal 0 check)
        let still_alive = Command::new("kill").arg("-0").arg(pid.to_string()).status().map(|s| s.success()).unwrap_or(false);

        if still_alive {
             // 4. SIGKILL (9) - Nuclear
            let _ = Command::new("kill").arg("-9").arg(pid.to_string()).output();
        }
    }
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        // /T = Tree kill (kill child processes too)
        // /F = Force
        Command::new("taskkill")
            .args(&["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output()?;
    }
    Ok(())
}

// --- Platform Specific Counters ---

#[cfg(target_os = "macos")]
fn get_monitor_count() -> i32 {
    use core_graphics::display::CGDisplay;
    match CGDisplay::active_displays() {
        Ok(d) => d.len() as i32,
        Err(_) => 1,
    }
}

#[cfg(target_os = "linux")]
fn get_monitor_count() -> i32 {
    // 1. Detect Wayland
    if std::env::var("XDG_SESSION_TYPE").map(|s| s.to_lowercase()).unwrap_or_default() == "wayland" {
        // Wayland: xrandr might report XWayland or nothing.
        // Try swaymsg if available (sway/wlroots)
        if let Ok(output) = Command::new("swaymsg").arg("-t").arg("get_outputs").output() {
             if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
                 if let Some(arr) = json.as_array() {
                     return arr.len() as i32;
                 }
             }
        }
        
        // Fallback: Check /sys/class/drm/card* (Kernel DRM)
        // Count directories starting with "card" that have "enabled" status?
        // Simpler: Just count cards.
        if let Ok(entries) = std::fs::read_dir("/sys/class/drm") {
             let count = entries.filter_map(|e| e.ok())
                .filter(|e| {
                    let name = e.file_name();
                    let s = name.to_string_lossy();
                    // Look for cardX-Connector (e.g. card0-HDMI-A-1)
                    // Actually, "card0" is the GPU. "card0-HDMI..." is the connector.
                    // We want to count *connected* outputs.
                    // Reading /sys/class/drm/card*-*/status == "connected"
                    s.starts_with("card") && s.contains("-")
                })
                .filter(|e| {
                    let status_path = e.path().join("status");
                    if let Ok(status) = std::fs::read_to_string(status_path) {
                        status.trim() == "connected"
                    } else {
                        false
                    }
                })
                .count();
            if count > 0 { return count as i32; }
        }
        
        // If all else fails on Wayland, return -1 (unknown) or 1.
        // Returning -1 might bypass the check if we handle it in caller, 
        // but current caller logic checks `current != last`.
        // If we return 1 consistently, feature is disabled.
        return 1; 
    }

    // 2. X11 Logic
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