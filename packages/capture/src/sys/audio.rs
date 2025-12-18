/*
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use std::process::Command;
use which::which;

pub struct AudioGuard {
    backend: Option<String>,
    #[allow(dead_code)]
    was_previously_muted: bool,
    muted_by_us: bool,
}

impl AudioGuard {
    pub fn new() -> Self {
        let mut guard = AudioGuard {
            backend: None,
            was_previously_muted: false,
            muted_by_us: false,
        };
        guard.mute();
        guard
    }

    fn mute(&mut self) {
        if cfg!(target_os = "macos") {
            if which("osascript").is_ok() {
                self.backend = Some("osascript".to_string());
                let output = run_cmd(
                    "osascript",
                    &["-e", "output muted of (get volume settings)"],
                );

                self.was_previously_muted = output.trim().to_lowercase() == "true";

                if !self.was_previously_muted {
                    let _ = run_cmd("osascript", &["-e", "set volume with output muted"]);
                    self.muted_by_us = true;
                }
            } else {
                log::warn!("osascript not found; cannot mute on macOS.");
            }
        } else if cfg!(target_os = "linux") {
            if which("pactl").is_ok() {
                self.backend = Some("pactl".to_string());
                let out = run_cmd("pactl", &["get-sink-mute", "@DEFAULT_SINK@"]).to_lowercase();
                self.was_previously_muted =
                    out.contains("yes") || out.contains("1") || out.contains("true");

                if !self.was_previously_muted {
                    let _ = run_cmd("pactl", &["set-sink-mute", "@DEFAULT_SINK@", "1"]);
                    self.muted_by_us = true;
                }
            } else if which("wpctl").is_ok() {
                self.backend = Some("wpctl".to_string());
                let out = run_cmd("wpctl", &["get-mute", "@DEFAULT_AUDIO_SINK@"]).to_lowercase();
                self.was_previously_muted = out.contains("muted") || out.contains("true");

                if !self.was_previously_muted {
                    let _ = run_cmd("wpctl", &["set-mute", "@DEFAULT_AUDIO_SINK@", "1"]);
                    self.muted_by_us = true;
                }
            } else if which("amixer").is_ok() {
                self.backend = Some("amixer".to_string());
                let out = run_cmd("amixer", &["get", "Master"]).to_lowercase();
                self.was_previously_muted =
                    out.contains("[off]") || out.contains("[mute]") || !out.contains("[on]");

                if !self.was_previously_muted {
                    let _ = run_cmd("amixer", &["-q", "sset", "Master", "mute"]);
                    self.muted_by_us = true;
                }
            }
        }
    }

    fn restore(&self) {
        if !self.muted_by_us {
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
                "amixer" => {
                    let _ = run_cmd("amixer", &["-q", "sset", "Master", "unmute"]);
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
