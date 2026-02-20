// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Cross-platform global keyboard shortcut listener.
//!
//! This crate provides a generic API for registering system-wide hotkeys.
//! Each platform uses its native, most reliable mechanism:
//!
//! - **Linux**: Native D-Bus Session Service + Desktop Environment Command Registration (`gsettings`/`qdbus`)
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
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub struct ShortcutConfig {
    pub linux_trigger: String,
    pub linux_description: String,
    pub windows_modifiers: u32,
    pub windows_vk: u32,
    pub macos_modifiers: u32,
    pub macos_keycode: u32,
}

pub struct ShortcutHandle {
    #[cfg(target_os = "linux")]
    inner: linux::LinuxHandle,
    #[cfg(target_os = "windows")]
    inner: windows::WindowsHandle,
    #[cfg(target_os = "macos")]
    inner: macos::MacosHandle,
}

impl ShortcutHandle {
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

    pub fn unregister(self) {
        self.inner.unregister();
    }
}

#[cfg(target_os = "linux")]
pub fn trigger_linux_ipc() -> bool {
    linux::trigger_linux_ipc()
}

#[cfg(target_os = "linux")]
pub fn install_linux_shortcut(bin_path: &str, trigger: &str, name: &str) -> Result<(), String> {
    linux::install_linux_shortcut(bin_path, trigger, name)
}
