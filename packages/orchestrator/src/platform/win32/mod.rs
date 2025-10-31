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
use anyhow::{anyhow, bail, Result};
use std::ffi::c_void;
use std::io::Read;
use std::os::windows::io::{FromRawHandle, IntoRawHandle};
use std::path::Path;
use std::ptr::null_mut;
use sysinfo::{ProcessRefreshKind, RefreshKind, System};
use windows::{
    core::HSTRING,
    Win32::{
        Foundation::{CloseHandle, BOOL, HANDLE, INVALID_HANDLE_VALUE},
        Security::{
            DuplicateTokenEx, SecurityImpersonation, TokenAssignPrimary, TokenDuplicate,
            TokenImpersonate, TokenQuery, TokenType, TOKEN_ACCESS_MASK,
        },
        System::{
            Environment::{CreateEnvironmentBlock, DestroyEnvironmentBlock},
            Pipes::CreatePipe,
            RemoteDesktop::{
                WTSActive, WTSEnumerateSessionsW, WTSFreeMemory, WTSGetActiveConsoleSessionId,
                WTSQueryUserToken, WTS_SESSION_INFOW,
            },
            Threading::{
                CreateProcessAsUserW, GetExitCodeProcess, WaitForSingleObject, CREATE_NO_WINDOW,
                CREATE_UNICODE_ENVIRONMENT, INFINITE, PROCESS_INFORMATION, STARTF_USESHOWWINDOW,
                STARTF_USESTDHANDLES, STARTUPINFOW,
            },
        },
        UI::WindowsAndMessaging::{SW_HIDE, SW_SHOW},
    },
};

const CORE_PS1: &str = include_str!("core.ps1");

pub fn get_monitor_count(paths: &AppPaths) -> Result<u32> {
    write_core_script(paths)?;
    let output = run_core_sync(paths, "count-monitors", &[])?;
    Ok(output.trim().parse().unwrap_or(1))
}

pub fn run_grab_screen(paths: &AppPaths) -> Result<()> {
    write_core_script(paths)?;
    let cmd_line = format!(
        "-ExecutionPolicy Bypass -File \"{}\" grab-screen",
        paths.core_path.to_string_lossy()
    );
    let (_, stderr, exit_code) =
        launch_in_user_session("powershell.exe", Some(&cmd_line), None, false, true, false)?;

    if exit_code != 0 {
        return Err(anyhow!("grab-screen failed: {}", stderr));
    }
    Ok(())
}

pub fn run_draw_view(paths: &AppPaths) -> Result<()> {
    write_core_script(paths)?;
    let cmd_line = format!(
        "-ExecutionPolicy Bypass -File \"{}\" draw-view *> $null",
        paths.core_path.to_string_lossy()
    );
    launch_in_user_session("powershell.exe", Some(&cmd_line), None, true, false, false)?;
    Ok(())
}

pub fn run_spatialshot(paths: &AppPaths, img_path: &Path) -> Result<()> {
    write_core_script(paths)?;
    let cmd_line = format!(
        "-ExecutionPolicy Bypass -File \"{}\" spatialshot \"{}\" *> $null",
        paths.core_path.to_string_lossy(),
        img_path.to_string_lossy()
    );
    launch_in_user_session("powershell.exe", Some(&cmd_line), None, true, false, false)?;
    Ok(())
}

fn write_core_script(paths: &AppPaths) -> Result<()> {
    std::fs::write(&paths.core_path, CORE_PS1)?;
    Ok(())
}

fn run_core_sync(paths: &AppPaths, arg: &str, extra_args: &[&str]) -> Result<String> {
    let mut cmd_line = format!(
        "-ExecutionPolicy Bypass -File \"{}\" {}",
        paths.core_path.to_string_lossy(),
        arg
    );
    for extra in extra_args {
        cmd_line.push_str(&format!(" \"{}\"", extra));
    }

    let (stdout, stderr, exit_code) =
        launch_in_user_session("powershell.exe", Some(&cmd_line), None, false, true, true)?;

    if exit_code != 0 {
        return Err(anyhow!(
            "Command failed with exit code {}: {}",
            exit_code,
            stderr
        ));
    }
    Ok(stdout)
}

fn launch_in_user_session(
    app_path: &str,
    cmd_line: Option<&str>,
    work_dir: Option<&str>,
    visible: bool,
    wait: bool,
    capture: bool,
) -> Result<(String, String, i32)> {
    let h_token = get_session_user_token()?;

    let mut env: *mut c_void = null_mut();
    unsafe { CreateEnvironmentBlock(&mut env, h_token, BOOL(0)) }.ok()?;

    let mut startup_info = STARTUPINFOW::default();
    startup_info.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
    let mut desktop_w: Vec<u16> = "winsta0\\default".encode_utf16().chain(Some(0)).collect();
    startup_info.lpDesktop = desktop_w.as_mut_ptr();

    startup_info.wShowWindow = if visible { SW_SHOW.0 } else { SW_HIDE.0 };
    startup_info.dwFlags = STARTF_USESHOWWINDOW;

    let mut h_stdout_read = INVALID_HANDLE_VALUE;
    let mut h_stderr_read = INVALID_HANDLE_VALUE;

    if wait && capture {
        let (read, write) = create_pipe()?;
        startup_info.hStdOutput = write;
        h_stdout_read = read;

        let (read, write) = create_pipe()?;
        startup_info.hStdError = write;
        h_stderr_read = read;

        startup_info.dwFlags |= STARTF_USESTDHANDLES;
    }

    let mut process_info = PROCESS_INFORMATION::default();
    let creation_flags = CREATE_UNICODE_ENVIRONMENT | if visible { 0 } else { CREATE_NO_WINDOW.0 };

    let app_w = HSTRING::from(app_path);
    let work_w = work_dir.map(HSTRING::from);

    let cmd_line_str = cmd_line.unwrap_or("");
    let mut cmd_w: Vec<u16> = cmd_line_str.encode_utf16().chain(Some(0)).collect();
    let cmd_ptr = if cmd_line_str.is_empty() {
        null_mut()
    } else {
        cmd_w.as_mut_ptr()
    };

    let ok = unsafe {
        CreateProcessAsUserW(
            h_token,
            app_w.as_wide().as_ptr(),
            cmd_ptr,
            None,
            None,
            BOOL(if wait && capture { 1 } else { 0 }),
            creation_flags,
            env,
            work_w
                .as_ref()
                .map(|h| h.as_wide().as_ptr())
                .unwrap_or(null_mut()),
            &startup_info,
            &mut process_info,
        )
    };

    unsafe { DestroyEnvironmentBlock(env) };
    unsafe { CloseHandle(h_token) };

    if wait && capture {
        unsafe { CloseHandle(startup_info.hStdOutput) };
        unsafe { CloseHandle(startup_info.hStdError) };
    }

    if !ok.is_ok() {
        bail!("CreateProcessAsUserW failed");
    }

    if !wait {
        unsafe { CloseHandle(process_info.hThread) };
        unsafe { CloseHandle(process_info.hProcess) };
        return Ok((String::new(), String::new(), 0));
    }

    unsafe { CloseHandle(process_info.hThread) };
    unsafe { WaitForSingleObject(process_info.hProcess, INFINITE) };

    let mut exit_code = 0;
    unsafe { GetExitCodeProcess(process_info.hProcess, &mut exit_code) };
    unsafe { CloseHandle(process_info.hProcess) };

    let (stdout, stderr) = if capture {
        (
            read_pipe_to_string(h_stdout_read)?,
            read_pipe_to_string(h_stderr_read)?,
        )
    } else {
        (String::new(), String::new())
    };

    Ok((stdout, stderr, exit_code as i32))
}

fn create_pipe() -> Result<(HANDLE, HANDLE)> {
    let mut h_read = INVALID_HANDLE_VALUE;
    let mut h_write = INVALID_HANDLE_VALUE;
    unsafe { CreatePipe(&mut h_read, &mut h_write, None, 0) }.ok()?;
    Ok((h_read, h_write))
}

fn read_pipe_to_string(pipe: HANDLE) -> Result<String> {
    if pipe == INVALID_HANDLE_VALUE {
        return Ok(String::new());
    }
    let mut file = unsafe { std::fs::File::from_raw_handle(pipe.0 as *mut _) };
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)?;
    drop(file);
    Ok(String::from_utf8_lossy(&buf).to_string())
}

fn get_session_user_token() -> Result<HANDLE> {
    let mut session_id = unsafe { WTSGetActiveConsoleSessionId() };
    if session_id == 0xFFFFFFFF {
        let mut p_session_info = null_mut();
        let mut count = 0;
        unsafe { WTSEnumerateSessionsW(HANDLE(0), 0, 1, &mut p_session_info, &mut count) }.ok()?;
        let sessions = unsafe { std::slice::from_raw_parts(p_session_info, count as usize) };
        session_id = sessions
            .iter()
            .find(|s| s.State == WTSActive)
            .map(|s| s.SessionId)
            .unwrap_or(0xFFFFFFFF);
        unsafe { WTSFreeMemory(p_session_info as *mut _) };
    }

    if session_id == 0xFFFFFFFF {
        bail!("No active user session found");
    }

    let mut h_impersonation_token = HANDLE::default();
    unsafe { WTSQueryUserToken(session_id, &mut h_impersonation_token) }.ok()?;

    let mut h_token = HANDLE::default();
    let access = TOKEN_ACCESS_MASK(
        TokenAssignPrimary.0 | TokenDuplicate.0 | TokenQuery.0 | TokenImpersonate.0,
    );
    unsafe {
        DuplicateTokenEx(
            h_impersonation_token,
            access,
            None,
            SecurityImpersonation,
            TokenType::TokenPrimary,
            &mut h_token,
        )
    }
    .ok()?;

    unsafe { CloseHandle(h_impersonation_token) };
    Ok(h_token)
}

pub fn kill_running_packages(_paths: &AppPaths) {
    let mut sys = System::new_with_specifics(
        RefreshKind::new().with_processes(ProcessRefreshKind::everything()),
    );
    sys.refresh_processes();
    for process in sys.processes().values() {
        let name = process.name();
        if name == "scgrabber-bin.exe" || name == "drawview.exe" || name == "spatialshot.exe" {
            process.kill();
        }
    }
}
