/**
 * Copyright (C) 2025  a7mddra-spatialshot
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

use anyhow::{anyhow, Result};
use crate::shared::AppPaths;
use std::path::Path;
use std::process::{Command, Output};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};

const CORE_PS1: &str = include_str!("core.ps1");

pub fn run_grab_screen(paths: &AppPaths) -> Result<u32> {
    let cmd_line = format!(
        "-ExecutionPolicy Bypass -File \"{}\" grab-screen",
        paths.core_path.to_string_lossy()
    );
    let output = run_powershell_sync(&cmd_line)?;
    if !output.status.success() {
        return Err(anyhow!("grab-screen failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().parse()?)
}

pub fn run_draw_view(paths: &AppPaths) -> Result<()> {
    let cmd_line = format!(
        "-ExecutionPolicy Bypass -File \"{}\" draw-view",
        paths.core_path.to_string_lossy()
    );
    let output = run_powershell_sync(&cmd_line)?;
    if !output.status.success() {
        return Err(anyhow!("draw-view failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

pub fn run_spatialshot(paths: &AppPaths, img_path: &Path) -> Result<()> {
    let cmd_line = format!(
        "-ExecutionPolicy Bypass -File \"{}\" spatialshot \"{}\"",
        paths.core_path.to_string_lossy(),
        img_path.to_string_lossy()
    );
    let output = run_powershell_sync(&cmd_line)?;
    if !output.status.success() {
        return Err(anyhow!("spatialshot failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

pub fn write_core_script(paths: &AppPaths) -> Result<()> {
    std::fs::write(&paths.core_path, CORE_PS1)?;
    Ok(())
}

fn run_powershell_sync(cmd_args: &str) -> Result<Output> {
    let output = Command::new("powershell.exe")
        .arg(cmd_args)
        .output()?;
    Ok(output)
}

pub fn kill_running_packages(_paths: &AppPaths) {
    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
    );
    sys.refresh_processes_specifics(ProcessesToUpdate::All, false, ProcessRefreshKind::new());
    for process in sys.processes().values() {
        let name = process.name();
        if name == "scgrabber-bin.exe" || name == "drawview.exe" || name == "spatialshot.exe" {
            process.kill();
        }
    }
}
