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

use crate::shared::AppPaths;
use anyhow::{anyhow, Result};
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;
use sysinfo::{ProcessRefreshKind, RefreshKind, System, ProcessesToUpdate};

const CORE_SH: &str = include_str!("core.sh");

pub fn get_monitor_count(paths: &AppPaths) -> Result<u32> {
    write_core_script(paths)?;
    let output = run_core_sync(paths, "count-monitors", &[])?;
    Ok(output.trim().parse()?)
}

pub fn run_grab_screen(paths: &AppPaths) -> Result<()> {
    write_core_script(paths)?;
    run_core_sync(paths, "grab-screen", &[])?;
    Ok(())
}

pub fn run_draw_view(paths: &AppPaths) -> Result<()> {
    write_core_script(paths)?;
    run_core_async(paths, "draw-view", &[])
}

pub fn run_spatialshot(paths: &AppPaths, img_path: &Path) -> Result<()> {
    write_core_script(paths)?;
    run_core_async(paths, "spatialshot", &[img_path.to_str().unwrap()])
}

fn write_core_script(paths: &AppPaths) -> Result<()> {
    std::fs::write(&paths.core_path, CORE_SH)?;
    std::fs::set_permissions(&paths.core_path, std::fs::Permissions::from_mode(0o755))?;
    Ok(())
}

fn run_core_sync(paths: &AppPaths, arg: &str, extra_args: &[&str]) -> Result<String> {
    let mut cmd_str = format!("bash \"{}\" {}", paths.core_path.to_string_lossy(), arg);
    for extra in extra_args {
        cmd_str.push_str(&format!(" \"{}\"", extra));
    }

    let output = Command::new("bash").arg("-c").arg(&cmd_str).output()?;

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
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
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
