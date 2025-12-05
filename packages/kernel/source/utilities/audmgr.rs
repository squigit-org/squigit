/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use std::process::Command;
use which::which;

pub struct AudioGuard {
    backend: Option<String>,
    was_already_muted: bool,
}

impl AudioGuard {
    pub fn new() -> Self {
        let mut guard = AudioGuard {
            backend: None,
            was_already_muted: false,
        };
        guard.mute();
        guard
    }

    fn mute(&mut self) {
        if cfg!(target_os = "macos") {
            if which("osascript").is_ok() {
                self.backend = Some("osascript".to_string());
                let output = run_cmd("osascript", &["-e", "output muted of (get volume settings)"]);
                self.was_already_muted = output.trim() == "true";
                let _ = run_cmd("osascript", &["-e", "set volume with output muted"]);
            }
        } else if cfg!(target_os = "linux") {
            if which("pactl").is_ok() {
                self.backend = Some("pactl".to_string());
                let out = run_cmd("pactl", &["get-sink-mute", "@DEFAULT_SINK@"]);
                if !out.contains("yes") {
                    let _ = run_cmd("pactl", &["set-sink-mute", "@DEFAULT_SINK@", "1"]);
                    self.was_already_muted = true;
                }
            } else if which("wpctl").is_ok() {
                self.backend = Some("wpctl".to_string());
                let out = run_cmd("wpctl", &["get-mute", "@DEFAULT_AUDIO_SINK@"]);
                if !out.contains("MUTED") {
                    let _ = run_cmd("wpctl", &["set-mute", "@DEFAULT_AUDIO_SINK@", "1"]);
                    self.was_already_muted = true;
                }
            }
        }
    }

    fn restore(&self) {
        if self.was_already_muted {
            return;
        }

        if let Some(backend) = &self.backend {
            match backend.as_str() {
                "osascript" => {
                    let _ = run_cmd("osascript", &["-e", "set volume without output muted"]);
                }
                "pactl" => {
                    let _ = run_cmd("pactl", &["set-sink-mute", "@DEFAULT_SINK@", "0"]);
                }
                "wpctl" => {
                    let _ = run_cmd("wpctl", &["set-mute", "@DEFAULT_AUDIO_SINK@", "0"]);
                }
                _ => {}
            }
        }
    }
}

impl Drop for AudioGuard {
    fn drop(&mut self) {
        self.restore();
    }
}

fn run_cmd(cmd: &str, args: &[&str]) -> String {
    match Command::new(cmd).args(args).output() {
        Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_string(),
        Err(e) => {
            log::warn!("Audio backend cmd '{}' failed: {}", cmd, e);
            String::new()
        }
    }
}
