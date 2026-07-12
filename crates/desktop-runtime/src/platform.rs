// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! OS integration — system theme detection and package manager detection.

#[cfg(any(target_os = "linux", target_os = "macos"))]
use std::process::Command;

#[cfg(target_os = "linux")]
use zbus::blocking::Connection as BlockingConnection;

// =============================================================================
// System Theme Detection
// =============================================================================

/// Detects the current system theme using a robust cross-platform strategy.
/// Returns "dark" or "light".
pub fn get_system_theme() -> String {
    #[cfg(target_os = "linux")]
    {
        get_linux_theme()
    }
    #[cfg(target_os = "windows")]
    {
        get_windows_theme()
    }
    #[cfg(target_os = "macos")]
    {
        get_macos_theme()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        "light".to_string()
    }
}

#[cfg(target_os = "linux")]
fn get_linux_theme() -> String {
    if let Some(theme) = check_portal() {
        return theme;
    }
    if let Some(theme) = check_gsettings() {
        return theme;
    }
    if let Some(theme) = check_kreadconfig() {
        return theme;
    }
    "light".to_string()
}

#[cfg(target_os = "linux")]
fn check_portal() -> Option<String> {
    let connection = BlockingConnection::session().ok()?;

    let reply = connection.call_method(
        Some("org.freedesktop.portal.Desktop"),
        "/org/freedesktop/portal/desktop",
        Some("org.freedesktop.portal.Settings"),
        "Read",
        &("org.freedesktop.appearance", "color-scheme"),
    );

    match reply {
        Ok(msg) => {
            if let Ok((val,)) = msg.body().deserialize::<(zbus::zvariant::OwnedValue,)>() {
                if let Ok(u) = val.downcast_ref::<u32>() {
                    return match u {
                        1 => Some("dark".to_string()),
                        2 => Some("light".to_string()),
                        _ => None,
                    };
                }

                if let Ok(inner) = val.downcast_ref::<zbus::zvariant::Value>() {
                    if let Ok(u) = inner.downcast_ref::<u32>() {
                        return match u {
                            1 => Some("dark".to_string()),
                            2 => Some("light".to_string()),
                            _ => None,
                        };
                    }
                }
            }
            None
        }
        Err(_) => None,
    }
}

#[cfg(target_os = "linux")]
fn check_gsettings() -> Option<String> {
    let output = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "gtk-theme"])
        .output()
        .ok()?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let raw_theme = stdout.trim_matches('\'').trim_matches('"');
        if is_dark_heuristic(raw_theme) {
            return Some("dark".to_string());
        }
    }

    let output = Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "color-scheme"])
        .output()
        .ok()?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let raw = stdout.trim_matches('\'').trim_matches('"');
        if raw.contains("dark") {
            return Some("dark".to_string());
        }
        if raw == "default" || raw.contains("light") {
            return Some("light".to_string());
        }
    }

    None
}

#[cfg(target_os = "linux")]
fn check_kreadconfig() -> Option<String> {
    let output = Command::new("kreadconfig5")
        .args(["--group", "General", "--key", "ColorScheme"])
        .output()
        .ok()
        .or_else(|| {
            Command::new("kreadconfig6")
                .args(["--group", "General", "--key", "ColorScheme"])
                .output()
                .ok()
        })?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if is_dark_heuristic(&stdout) {
            return Some("dark".to_string());
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn is_dark_heuristic(theme_name: &str) -> bool {
    let lower = theme_name.to_lowercase();
    lower.contains("dark")
        || lower.contains("black")
        || lower.contains("night")
        || lower.contains("noir")
        || lower.contains("shadow")
}

#[cfg(target_os = "windows")]
fn get_windows_theme() -> String {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let path = "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize";

    if let Ok(key) = hkcu.open_subkey(path) {
        if let Ok(val) = key.get_value::<u32, _>("AppsUseLightTheme") {
            return if val == 0 {
                "dark".to_string()
            } else {
                "light".to_string()
            };
        }
    }
    "light".to_string()
}

#[cfg(target_os = "macos")]
fn get_macos_theme() -> String {
    let output = Command::new("defaults")
        .args(&["read", "-g", "AppleInterfaceStyle"])
        .output();

    if let Ok(o) = output {
        let stdout = String::from_utf8_lossy(&o.stdout).trim().to_string();
        if stdout == "Dark" {
            return "dark".to_string();
        }
    }
    "light".to_string()
}

// =============================================================================
// Linux Package Manager Detection
// =============================================================================

pub fn get_linux_package_manager() -> String {
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

// =============================================================================
// Machine Info
// =============================================================================

/// Returns a cleanly formatted diagnostic string: "{OS}/{Arch} ({Display})/ {Pkg}"
pub fn get_machine_info() -> String {
    let arch = std::env::consts::ARCH; // Safely returns "aarch64", "x86_64", etc.

    #[cfg(target_os = "linux")]
    {
        use std::env;
        use std::path::Path;

        // 1. Probe Display Server (Wayland vs X11)
        let display = env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".to_string());

        // 2. Probe Package Manager
        let pkg = if Path::new("/usr/bin/apt").exists() {
            "apt"
        } else if Path::new("/usr/bin/dnf").exists() {
            "dnf"
        } else if Path::new("/usr/bin/pacman").exists() {
            "pacman"
        } else {
            "custom"
        };

        // 3. Extract Pretty Name from os-release (e.g., "Ubuntu 26.04 LTS")
        let os_name = std::fs::read_to_string("/etc/os-release")
            .unwrap_or_default()
            .lines()
            .find(|line| line.starts_with("PRETTY_NAME="))
            .and_then(|line| line.split('=').nth(1))
            .map(|name| name.trim_matches('"').to_string())
            .unwrap_or_else(|| "Linux".to_string());

        format!("{}/{} ({}) {}", os_name, arch, display, pkg)
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        // 1. Get exact macOS version (e.g., 15.2)
        let os_name = Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|out| String::from_utf8(out.stdout).ok())
            .map(|s| format!("macOS {}", s.trim()))
            .unwrap_or_else(|| "macOS".to_string());

        // Squigit only supports Silicon, so Arch will be aarch64.
        // Display is safely Aqua, and Brew is the community standard.
        format!("{}/{} (Aqua) brew", os_name, arch)
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        // 1. Get Windows build version safely via cmd
        let os_name = Command::new("cmd")
            .args(&["/C", "ver"])
            .output()
            .ok()
            .and_then(|out| String::from_utf8(out.stdout).ok())
            .map(|s| s.replace("\r\n", "").trim().to_string())
            .unwrap_or_else(|| "Windows".to_string());

        // Display is DWM (Desktop Window Manager), and Winget is the modern native standard.
        format!("{}/{} (DWM) winget", os_name, arch)
    }
}
