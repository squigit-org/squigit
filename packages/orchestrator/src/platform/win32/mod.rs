/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use anyhow::{anyhow, Result};
use crate::shared::AppPaths;
use std::path::Path;
use std::process::{Command, Output};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};
use std::os::windows::process::CommandExt;
use windows::Win32::System::Threading::CREATE_NO_WINDOW;

const CORE_PS1: &str = include_str!("core.ps1");

pub fn run_grab_screen(paths: &AppPaths) -> Result<u32> {
    let core_path_str = paths.core_path.to_string_lossy().to_string();
    let output = run_powershell_sync(&["-ExecutionPolicy", "Bypass", "-File", &core_path_str, "grab-screen"])?;
    
    if !output.status.success() {
        return Err(anyhow!("grab-screen script failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let output_str = String::from_utf8_lossy(&output.stdout);

    let monitor_count_str = output_str
        .lines()
        .map(|line| line.trim())
        .find(|line| line.parse::<u32>().is_ok())
        .unwrap_or("0");

    match monitor_count_str.parse::<u32>() {
        Ok(count) => {
            if count == 0 {
                if output_str.contains("No screens detected") || output_str.contains("exit 1") {
                    return Err(anyhow!("grab-screen reported 0 monitors or failed: {}", output_str));
                }
            }
            Ok(count)
        },
        Err(e) => {
            Err(anyhow!("Failed to parse monitor count from output: {}. Error: {}", output_str, e))
        }
    }
}

pub fn run_draw_view(paths: &AppPaths) -> Result<()> {
    let core_path_str = paths.core_path.to_string_lossy().to_string();
    let output = run_powershell_sync(&["-ExecutionPolicy", "Bypass", "-File", &core_path_str, "draw-view"])?;
    if !output.status.success() {
        return Err(anyhow!("draw-view failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

pub fn run_spatialshot(paths: &AppPaths, img_path: &Path) -> Result<()> {
    let core_path_str = paths.core_path.to_string_lossy().to_string();
    let img_path_str = img_path.to_string_lossy().to_string();
    let output = run_powershell_sync(&["-ExecutionPolicy", "Bypass", "-File", &core_path_str, "spatialshot", &img_path_str])?;
    if !output.status.success() {
        return Err(anyhow!("spatialshot failed: {}", String::from_utf8_lossy(&output.stderr)));
    }
    Ok(())
}

pub fn write_core_script(paths: &AppPaths) -> Result<()> {
    std::fs::write(&paths.core_path, CORE_PS1)?;
    Ok(())
}

fn run_powershell_sync(args: &[&str]) -> Result<Output> {
    let output = Command::new("powershell.exe")
        .creation_flags(CREATE_NO_WINDOW.0)
        .args(args)
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
