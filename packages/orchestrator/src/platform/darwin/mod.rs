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
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};

const CORE_SH: &str = include_str!("core.sh");

pub fn run_grab_screen(paths: &AppPaths) -> Result<u32> {
    // UPDATED to return count
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
    let (uid, _) = get_user_uid()?;

    let mut cmd_str = format!("bash \"{}\" {}", paths.core_path.to_string_lossy(), arg);
    for extra in extra_args {
        cmd_str.push_str(&format!(" \"{}\"", extra));
    }

    let output = Command::new("launchctl")
        .arg("asuser")
        .arg(uid)
        .arg("sh")
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
    let (uid, _) = get_user_uid()?;

    let mut cmd_str = format!("bash \"{}\" {}", paths.core_path.to_string_lossy(), arg);
    for extra in extra_args {
        cmd_str.push_str(&format!(" \"{}\"", extra));
    }

    let output = Command::new("launchctl")
        .arg("asuser")
        .arg(uid)
        .arg("sh")
        .arg("-c")
        .arg(&cmd_str)
        .output()?;

    if !output.status.success() {
        return Err(anyhow!(
            "Command failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

fn get_user_uid() -> Result<(String, String)> {
    let user_output = Command::new("stat")
        .arg("-f")
        .arg("%Su")
        .arg("/dev/console")
        .output()?;
    let user = String::from_utf8_lossy(&user_output.stdout).trim().to_string();

    let uid_output = Command::new("id").arg("-u").arg(&user).output()?;
    let uid = String::from_utf8_lossy(&uid_output.stdout).trim().to_string();

    if user.is_empty() || uid.is_empty() {
        return Err(anyhow!("No active user found"));
    }
    Ok((uid, user))
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

