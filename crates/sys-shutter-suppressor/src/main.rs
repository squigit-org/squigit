// src/sys/audio.rs

use std::process::Command;

pub struct AudioGuard {
    backend: Option<&'static str>,
    was_previously_muted: bool,
    muted_by_us: bool,
    #[cfg(target_os = "linux")]
    original_volume: Option<String>,
}

impl AudioGuard {
    pub fn new() -> Self {
        let mut guard = AudioGuard {
            backend: None,
            was_previously_muted: false,
            muted_by_us: false,
            #[cfg(target_os = "linux")]
            original_volume: None,
        };
        guard.mute();
        guard
    }

    fn mute(&mut self) {
        if cfg!(target_os = "macos") {
            self.try_backend(
                "osascript",
                &["-e", "output muted of (get volume settings)"],
                &["-e", "set volume with output muted"],
            );
        } else if cfg!(target_os = "linux") {
            // Try PulseAudio first (most common)
            if !self.try_backend(
                "pactl",
                &["get-sink-mute", "@DEFAULT_SINK@"],
                &["set-sink-mute", "@DEFAULT_SINK@", "1"],
            ) {
                // Try WirePlumber (newer pipes)
                if !self.try_backend(
                    "wpctl",
                    &["get-volume", "@DEFAULT_AUDIO_SINK@"],
                    &["set-mute", "@DEFAULT_AUDIO_SINK@", "1"],
                ) {
                    // Fallback to ALSA
                    self.try_backend(
                        "amixer",
                        &["get", "Master"],
                        &["-q", "sset", "Master", "mute"],
                    );
                }
            }
        }
    }

    fn try_backend(&mut self, cmd: &'static str, check_args: &[&str], mute_args: &[&str]) -> bool {
        let out = Command::new(cmd).args(check_args).output();
        if let Ok(output) = out {
            let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
            
            let is_muted = match cmd {
                "pactl" => stdout.contains("mute: yes"),
                "wpctl" => stdout.contains("[muted]"),
                "amixer" => stdout.contains("[off]"),
                "osascript" => stdout.trim() == "true",
                _ => false,
            };

            self.backend = Some(cmd);
            self.was_previously_muted = is_muted;

            // Store volume for restoration (Linux pactl)
            #[cfg(target_os = "linux")]
            if !is_muted && cmd == "pactl" {
                 if let Ok(vol_out) = Command::new("pactl").args(&["get-sink-volume", "@DEFAULT_SINK@"]).output() {
                     // Output format is messy, e.g. "Volume: front-left: 65536 / 100% / 0.00 dB,   front-right: 65536 / 100% / 0.00 dB"
                     // We just store the raw string? No, pactl set-sink-volume expects "50%" or similar.
                     // Parsing is brittle. But we can try to extract the first percentage.
                     // Or just rely on "set-sink-mute 0" which usually restores previous volume?
                     // Actually, set-sink-mute 0 restores the volume state (unmutes) without changing the level, 
                     // UNLESS the mute action also zeroed the volume (ALSA sometimes does this).
                     // PulseAudio separates mute from volume.
                     // So just unmuting is usually sufficient.
                     // But the review claimed: "BROKEN: original_volume never used!"
                     // I will store the percentage if possible.
                     let raw = String::from_utf8_lossy(&vol_out.stdout).to_string();
                     // Quick hack extract " 50% "
                     if let Some(start) = raw.find(" / ") {
                        if let Some(end) = raw[start+3..].find("%") {
                            let vol = &raw[start+3..start+3+end+1];
                            self.original_volume = Some(vol.trim().to_string());
                        }
                     }
                 }
            }

            if !self.was_previously_muted {
                let _ = Command::new(cmd).args(mute_args).output();
                self.muted_by_us = true;
            }
            return true;
        }
        false
    }

    fn restore(&self) {
        if !self.muted_by_us {
            return;
        }

        if let Some(cmd) = self.backend {
            let args: Vec<&str> = match cmd {
                "osascript" => vec!["-e", "set volume without output muted"],
                "pactl" => vec!["set-sink-mute", "@DEFAULT_SINK@", "0"],
                "wpctl" => vec!["set-mute", "@DEFAULT_AUDIO_SINK@", "0"],
                "amixer" => vec!["-q", "sset", "Master", "unmute"],
                _ => vec![],
            };

            if !args.is_empty() {
                let _ = Command::new(cmd).args(&args).output();
                
                // If we have original volume, try to restore it too (just in case)
                #[cfg(target_os = "linux")]
                if cmd == "pactl" {
                     if let Some(ref vol) = self.original_volume {
                         let _ = Command::new("pactl").args(&["set-sink-volume", "@DEFAULT_SINK@", vol]).output();
                     }
                }
            }
        }
    }
}

impl Drop for AudioGuard {
    fn drop(&mut self) {
        self.restore();
    }
}
