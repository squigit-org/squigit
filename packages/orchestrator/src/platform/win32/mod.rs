/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use crate::shared::AppPaths;
use anyhow::{anyhow, Result};
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};
use windows::Win32::System::Threading::CREATE_NO_WINDOW;

mod core;

pub fn run_grab_screen(paths: &AppPaths) -> Result<u32> {
    core::enable_dpi_awareness();

    if paths.tmp_dir.exists() {
        std::fs::remove_dir_all(&paths.tmp_dir)?;
    }
    std::fs::create_dir_all(&paths.tmp_dir)?;

    let nircmdc_path = paths.spatial_dir.join("3rdparty").join("nircmdc.exe");
    if !nircmdc_path.exists() {
        return Err(anyhow!(
            "nircmdc.exe not found at {}",
            nircmdc_path.display()
        ));
    }

    let monitors = core::get_monitor_bounds_sorted();
    let monitor_count = monitors.len() as u32;

    if monitor_count == 0 {
        return Err(anyhow!("No monitors detected by EnumDisplayMonitors."));
    }

    for (i, (x, y, w, h)) in monitors.iter().enumerate() {
        let filename = paths.tmp_dir.join(format!("{}.png", i + 1));
        
        let status = Command::new(&nircmdc_path)
            .creation_flags(CREATE_NO_WINDOW.0)
            .args([
                "savescreenshot",
                &filename.to_string_lossy(),
                &x.to_string(),
                &y.to_string(),
                &w.to_string(),
                &h.to_string(),
            ])
            .status()?;

        if !status.success() {
            eprintln!("nircmdc failed for monitor {}", i);
        }
    }

    Ok(monitor_count)
}

pub fn run_draw_view(paths: &AppPaths) -> Result<()> {
    let exe_path = paths.spatial_dir.join("capkit").join("drawview.exe");
    Command::new(exe_path)
        .creation_flags(CREATE_NO_WINDOW.0)
        .spawn()?;
    Ok(())
}

pub fn run_spatialshot(paths: &AppPaths, img_path: &Path) -> Result<()> {
    let exe_path = paths.spatial_dir.join("app").join("spatialshot.exe");
    Command::new(exe_path)
        .creation_flags(CREATE_NO_WINDOW.0)
        .arg(img_path)
        .spawn()?;
    Ok(())
}

pub fn write_core_script(_paths: &AppPaths) -> Result<()> {
    Ok(())
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
