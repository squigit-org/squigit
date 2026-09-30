// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Shared machine identity for CLI and desktop shells.
//!
//! Moved from the desktop runtime so every shell reports the same
//! diagnostic string and installer family from one implementation.

/// Returns a cleanly formatted diagnostic string: "{OS}/{Arch} ({Display}) {Installer}"
pub fn get_machine_info() -> String {
    let arch = std::env::consts::ARCH;

    #[cfg(target_os = "linux")]
    {
        use std::env;
        use std::path::Path;

        let display = env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".to_string());

        let installer = if Path::new("/usr/bin/apt").exists() {
            "apt"
        } else if Path::new("/usr/bin/dnf").exists() {
            "dnf"
        } else if Path::new("/usr/bin/pacman").exists() {
            "pacman"
        } else {
            "custom"
        };

        let os_name = std::fs::read_to_string("/etc/os-release")
            .unwrap_or_default()
            .lines()
            .find(|line| line.starts_with("PRETTY_NAME="))
            .and_then(|line| line.split('=').nth(1))
            .map(|name| name.trim_matches('"').to_string())
            .unwrap_or_else(|| "Linux".to_string());

        format!("{os_name}/{arch} ({display}) {installer}")
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        let os_name = Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|out| String::from_utf8(out.stdout).ok())
            .map(|s| format!("macOS {}", s.trim()))
            .unwrap_or_else(|| "macOS".to_string());

        format!("{os_name}/{arch} (Aqua) brew")
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let os_name = Command::new("cmd")
            .args(["/C", "ver"])
            .output()
            .ok()
            .and_then(|out| String::from_utf8(out.stdout).ok())
            .map(|s| s.replace("\r\n", "").trim().to_string())
            .unwrap_or_else(|| "Windows".to_string());

        format!("{os_name}/{arch} (DWM) winget")
    }
}

pub fn get_linux_distribution_family() -> String {
    #[cfg(target_os = "linux")]
    {
        let debian = std::path::Path::new("/etc/debian_version").exists()
            || std::path::Path::new("/usr/bin/dpkg").exists()
            || std::path::Path::new("/bin/dpkg").exists();
        if debian {
            return "debian".to_string();
        }
        let rpm = std::path::Path::new("/etc/redhat-release").exists()
            || std::path::Path::new("/etc/fedora-release").exists()
            || std::path::Path::new("/usr/bin/rpm").exists()
            || std::path::Path::new("/bin/rpm").exists();
        if rpm {
            return "rpm".to_string();
        }
    }
    "unknown".to_string()
}
