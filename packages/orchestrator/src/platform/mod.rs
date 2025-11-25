/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Linux ---
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use self::linux::{
    kill_running_packages, run_draw_view, run_grab_screen, run_spatialshot, write_core_script,
};

// --- Windows ---
#[cfg(target_os = "windows")]
mod win32;
#[cfg(target_os = "windows")]
pub use self::win32::{
    kill_running_packages, run_draw_view, run_grab_screen, run_spatialshot, write_core_script,
};

// --- macOS ---
#[cfg(target_os = "macos")]
mod darwin;
#[cfg(target_os = "macos")]
pub use self::darwin::{
    kill_running_packages, run_draw_view, run_grab_screen, run_spatialshot, write_core_script,
};

#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
pub fn run_grab_screen(_paths: &crate::shared::AppPaths) -> anyhow::Result<u32> {
    anyhow::bail!("Unsupported platform");
}

#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
pub fn run_draw_view(_paths: &crate::shared::AppPaths) -> anyhow::Result<()> {
    anyhow::bail!("Unsupported platform");
}

#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
pub fn run_spatialshot(
    _paths: &crate::shared::AppPaths,
    _imgpath: &std::path::Path,
) -> anyhow::Result<()> {
    anyhow::bail!("Unsupported platform");
}

#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
pub fn kill_running_packages(_paths: &crate::shared::AppPaths) {}

#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
pub fn write_core_script(_paths: &crate::shared::AppPaths) -> anyhow::Result<()> {
    Ok(())
}
