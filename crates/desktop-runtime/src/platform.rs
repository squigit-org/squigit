// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! OS integration — system theme detection, package manager detection, file manager reveal.

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
// File Manager Reveal
// =============================================================================

pub fn reveal_in_file_manager(path: String) -> Result<(), String> {
    use std::process::Command;

    let resolved = squigit_brain::provider::attachments::resolve_attachment_path_buf(&path)?;

    #[cfg(target_os = "windows")]
    {
        let target = resolved.to_string_lossy().to_string();
        Command::new("explorer")
            .arg(format!(r#"/select,"{}""#, target))
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg("-R")
            .arg(&resolved)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let target = resolved.to_string_lossy().to_string();
        let parent = resolved
            .parent()
            .ok_or_else(|| "No parent directory".to_string())?
            .to_string_lossy()
            .to_string();

        let select_candidates: Vec<(&str, Vec<String>)> = vec![
            ("nautilus", vec!["--select".into(), target.clone()]),
            ("nemo", vec!["--select".into(), target.clone()]),
            ("caja", vec!["--select".into(), target.clone()]),
            ("dolphin", vec!["--select".into(), target.clone()]),
            ("konqueror", vec![target.clone()]),
            ("thunar", vec!["--select".into(), target.clone()]),
            ("pcmanfm-qt", vec!["--select".into(), target.clone()]),
            ("pcmanfm", vec!["--select".into(), target.clone()]),
            ("spacefm", vec!["--select".into(), target.clone()]),
            ("pantheon-files", vec![target.clone()]),
            ("doublecmd", vec![target.clone()]),
            ("krusader", vec![target.clone()]),
            ("xfe", vec![target.clone()]),
        ];

        for (bin, args) in select_candidates {
            if Command::new(bin).args(&args).spawn().is_ok() {
                return Ok(());
            }
        }

        let parent_candidates: Vec<(&str, Vec<String>)> = vec![
            ("xdg-open", vec![parent.clone()]),
            ("gio", vec!["open".into(), parent.clone()]),
            ("exo-open", vec![parent.clone()]),
            ("kde-open5", vec![parent.clone()]),
            ("kde-open", vec![parent.clone()]),
            ("gnome-open", vec![parent.clone()]),
            ("pcmanfm", vec![parent.clone()]),
            ("thunar", vec![parent.clone()]),
            ("nemo", vec![parent.clone()]),
            ("caja", vec![parent.clone()]),
            ("dolphin", vec![parent.clone()]),
            ("nautilus", vec![parent.clone()]),
            ("pantheon-files", vec![parent.clone()]),
        ];

        for (bin, args) in parent_candidates {
            if Command::new(bin).args(&args).spawn().is_ok() {
                return Ok(());
            }
        }

        return Err("Failed to open a file manager on this Linux environment".to_string());
    }

    #[allow(unreachable_code)]
    Err("Unsupported platform".to_string())
}
