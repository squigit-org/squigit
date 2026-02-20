// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Cross-platform global keyboard shortcut listener.
//!
//! This crate provides a generic API for registering system-wide hotkeys.
//! Each platform uses its native, most reliable mechanism:
//!
//! - **Linux**: XDG Desktop Portal `GlobalShortcuts` (Wayland-safe)
//! - **Windows**: `RegisterHotKey` (Win32)
//! - **macOS**: `RegisterEventHotKey` (Carbon)
//!
//! # Usage
//!
//! ```no_run
//! use sys_global_shortcut::{ShortcutConfig, ShortcutHandle};
//!
//! let handle = ShortcutHandle::register(
//!     ShortcutConfig {
//!         linux_trigger: "SUPER+SHIFT+a".into(),
//!         linux_description: "Toggle my app".into(),
//!         windows_modifiers: 0x0008 | 0x0004, // MOD_WIN | MOD_SHIFT
//!         windows_vk: 0x41,                    // VK_A
//!         macos_modifiers: 0x0100 | 0x0200,    // cmdKey | shiftKey
//!         macos_keycode: 0x00,                 // kVK_ANSI_A
//!     },
//!     || println!("Shortcut fired!"),
//! ).expect("Failed to register shortcut");
//!
//! // Later: handle.unregister();
//! ```

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "macos")]
mod macos;

/// Per-platform shortcut definition.
///
/// Each platform uses different key representation formats.
/// The consumer specifies the exact values per OS.
pub struct ShortcutConfig {
    // ── Linux (XDG Portal) ──
    /// XDG shortcuts spec trigger string, e.g. `"SUPER+SHIFT+a"`.
    pub linux_trigger: String,
    /// Human-readable description shown in the portal permission dialog.
    pub linux_description: String,

    // ── Windows (RegisterHotKey) ──
    /// Win32 modifier flags (e.g. `MOD_WIN | MOD_SHIFT` = `0x000C`).
    pub windows_modifiers: u32,
    /// Win32 virtual key code (e.g. `0x41` for 'A').
    pub windows_vk: u32,

    // ── macOS (Carbon RegisterEventHotKey) ──
    /// Carbon modifier flags (e.g. `cmdKey | shiftKey`).
    pub macos_modifiers: u32,
    /// macOS virtual keycode (e.g. `0x00` for kVK_ANSI_A).
    pub macos_keycode: u32,
}

/// Handle to a registered global shortcut.
///
/// Dropping this handle does **not** automatically unregister.
/// Call [`ShortcutHandle::unregister`] explicitly for clean teardown.
pub struct ShortcutHandle {
    #[cfg(target_os = "linux")]
    inner: linux::LinuxHandle,
    #[cfg(target_os = "windows")]
    inner: windows::WindowsHandle,
    #[cfg(target_os = "macos")]
    inner: macos::MacosHandle,
}

impl ShortcutHandle {
    /// Register a global shortcut and start listening.
    ///
    /// Spawns a platform-specific listener thread internally.
    /// `callback` fires whenever the shortcut is activated.
    pub fn register<F>(config: ShortcutConfig, callback: F) -> Result<Self, String>
    where
        F: Fn() + Send + Sync + 'static,
    {
        #[cfg(target_os = "linux")]
        {
            let inner = linux::LinuxHandle::register(config, callback)?;
            Ok(Self { inner })
        }
        #[cfg(target_os = "windows")]
        {
            let inner = windows::WindowsHandle::register(config, callback)?;
            Ok(Self { inner })
        }
        #[cfg(target_os = "macos")]
        {
            let inner = macos::MacosHandle::register(config, callback)?;
            Ok(Self { inner })
        }
    }

    /// Stop the listener and release OS resources.
    pub fn unregister(self) {
        self.inner.unregister();
    }
}
