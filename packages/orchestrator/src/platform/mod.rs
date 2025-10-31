/**
 *  Copyright (C) 2025  a7mddra-spatialshot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

// --- Linux ---
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use self::linux::{
    get_monitor_count, kill_running_packages, run_draw_view, run_grab_screen, run_spatialshot,
};

// --- Windows ---
#[cfg(target_os = "windows")]
mod win32;
#[cfg(target_os = "windows")]
pub use self::win32::{
    get_monitor_count, kill_running_packages, run_draw_view, run_grab_screen, run_spatialshot,
};

// --- macOS ---
#[cfg(target_os = "macos")]
mod darwin;
#[cfg(target_os = "macos")]
pub use self::darwin::{
    get_monitor_count, kill_running_packages, run_draw_view, run_grab_screen, run_spatialshot,
};

// --- Unsupported Platforms ---
#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
pub fn run_grab_screen(_paths: &crate::shared::AppPaths) -> anyhow::Result<()> {
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
pub fn get_monitor_count(_paths: &crate::shared::AppPaths) -> anyhow::Result<u32> {
    Ok(1)
}

#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
pub fn kill_running_packages(_paths: &crate::shared::AppPaths) {}
