/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use anyhow::{anyhow, Result};
use crate::shared::AppPaths;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};

const CORE_SH: &str = include_str!("core.sh");

pub fn run_grab_screen(paths: &AppPaths) -> Result<u32> {
    let output = run_core_sync(paths, "grab-screen", &[])?;
    Ok(output.trim().parse()?)
}

pub fn run_draw_view(paths: &AppPaths) -> Result<()> {
    run_core_async(paths, "draw-view", &[])
}

pub fn run_spatialshot(paths: &AppPaths, img_path: &Path) -> Result<()> {
    run_core_async(paths, "spatialshot", &[img_path.to_str().unwrap()])
}

pub fn write_core_script(paths: &AppPaths) -> Result<()> {
    std::fs::write(&paths.core_path, CORE_SH)?;
    std::fs::set_permissions(&paths.core_path, std::fs::Permissions::from_mode(0o755))?;
    Ok(())
}

fn run_core_sync(paths: &AppPaths, arg: &str, extra_args: &[&str]) -> Result<String> {
    let mut cmd_str = format!("bash \"{}\" {}", paths.core_path.to_string_lossy(), arg);
    for extra in extra_args {
        cmd_str.push_str(&format!(" \"{}\"", extra));
    }

    let output = Command::new("bash")
        .arg("-c")
        .arg(&cmd_str)
        .output()?;

    if !output.status.success() {
        return Err(anyhow!(
            "Command failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn run_core_async(paths: &AppPaths, arg: &str, extra_args: &[&str]) -> Result<()> {
    let mut cmd_str = format!("bash \"{}\" {}", paths.core_path.to_string_lossy(), arg);
    for extra in extra_args {
        cmd_str.push_str(&format!(" \"{}\"", extra));
    }

    Command::new("bash")
        .arg("-c")
        .arg(&cmd_str)
        .spawn()?;

    Ok(())
}

pub fn kill_running_packages(_paths: &AppPaths) {
    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
    );
    sys.refresh_processes_specifics(ProcessesToUpdate::All, false, ProcessRefreshKind::new());
    for process in sys.processes().values() {
        let name = process.name();
        if name == "scgrabber-bin" || name == "drawview-bin" || name == "spatialshot" {
            process.kill();
        }
    }
}
