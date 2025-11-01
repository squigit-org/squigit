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

use anyhow::{anyhow, bail, Result};
use crate::shared::AppPaths;
use std::ffi::c_void;
use std::io::Read;
use std::os::windows::io::FromRawHandle;
use std::path::Path;
use std::ptr::null_mut;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, RefreshKind, System};
use windows::{
    core::{HSTRING, PCWSTR, PWSTR},
    Win32::{
        Foundation::{CloseHandle, BOOL, HANDLE, INVALID_HANDLE_VALUE},
        Security::{
            DuplicateTokenEx, SecurityImpersonation, TOKEN_ASSIGN_PRIMARY, TOKEN_DUPLICATE,
            TOKEN_IMPERSONATE, TOKEN_QUERY, TokenPrimary,
        },
        System::{
            Environment::{CreateEnvironmentBlock, DestroyEnvironmentBlock},
            Pipes::CreatePipe,
            RemoteDesktop::{
                WTSEnumerateSessionsW, WTSFreeMemory, WTSGetActiveConsoleSessionId,
                WTSQueryUserToken, WTSActive,
            },
            Threading::{
                CreateProcessAsUserW, GetExitCodeProcess, WaitForSingleObject,
                CREATE_NO_WINDOW, CREATE_UNICODE_ENVIRONMENT, INFINITE, PROCESS_CREATION_FLAGS,
                PROCESS_INFORMATION, STARTF_USESHOWWINDOW, STARTF_USESTDHANDLES, STARTUPINFOW,
            },
        },
        UI::WindowsAndMessaging::{SW_HIDE, SW_SHOW},
    },
};

const CORE_PS1: &str = include_str!("core.ps1");

pub fn run_grab_screen(paths: &AppPaths) -> Result<u32> {
    let cmd_line = format!(
        "-ExecutionPolicy Bypass -File \"{}\" grab-screen",
        paths.core_path.to_string_lossy()
    );
    let (stdout, stderr, exit_code) =
        launch_in_user_session("powershell.exe", Some(&cmd_line), None, false, true, true)?;

    if exit_code != 0 {
        return Err(anyhow!("grab-screen failed: {}", stderr));
    }
    Ok(stdout.trim().parse()?)
}

pub fn run_draw_view(paths: &AppPaths) -> Result<()> {
    let cmd_line = format!(
        "-ExecutionPolicy Bypass -File \"{}\" draw-view",
        paths.core_path.to_string_lossy()
    );
    let (_, stderr, exit_code) =
        launch_in_user_session("powershell.exe", Some(&cmd_line), None, false, true, true)?;

    if exit_code != 0 {
        return Err(anyhow!("draw-view failed: {}", stderr));
    }
    Ok(())
}

pub fn run_spatialshot(paths: &AppPaths, img_path: &Path) -> Result<()> {
    let cmd_line = format!(
        "-ExecutionPolicy Bypass -File \"{}\" spatialshot \"{}\"",
        paths.core_path.to_string_lossy(),
        img_path.to_string_lossy()
    );
    let (_, stderr, exit_code) =
        launch_in_user_session("powershell.exe", Some(&cmd_line), None, false, true, true)?;

    if exit_code != 0 {
        return Err(anyhow!("spatialshot failed: {}", stderr));
    }
    Ok(())
}

pub fn write_core_script(paths: &AppPaths) -> Result<()> {
    std::fs::write(&paths.core_path, CORE_PS1)?;
    Ok(())
}

fn run_core_sync(paths: &AppPaths, arg: &str, extra_args: &[&str]) -> Result<String> {
    let mut cmd_str = format!(
        "-ExecutionPolicy Bypass -File \"{}\" {}",
        paths.core_path.to_string_lossy(),
        arg
    );
    for extra in extra_args {
        cmd_str.push_str(&format!(" \"{}\"", extra));
    }
    let (stdout, stderr, exit_code) =
        launch_in_user_session("powershell.exe", Some(&cmd_str), None, false, true, true)?;

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
    if !unsafe { CreateEnvironmentBlock(&mut env, h_token, BOOL(0)) }.is_ok() {
        bail!("CreateEnvironmentBlock failed");
    }

    let mut startup_info = STARTUPINFOW::default();
    startup_info.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
    let mut desktop_w: Vec<u16> = "winsta0\\default".encode_utf16().chain(Some(0)).collect();
    startup_info.lpDesktop = PWSTR(desktop_w.as_mut_ptr());

    startup_info.wShowWindow = if visible { SW_SHOW.0 as u16 } else { SW_HIDE.0 as u16 };
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
    let creation_flags =
        CREATE_UNICODE_ENVIRONMENT | if visible { PROCESS_CREATION_FLAGS(0) } else { CREATE_NO_WINDOW };

    let app_w = HSTRING::from(app_path);
    let work_w = work_dir.map(HSTRING::from);

    let work_dir_pcwstr = work_w.as_ref().map_or(PCWSTR::null(), |s| PCWSTR(s.as_ptr()));

    let cmd_line_str = cmd_line.unwrap_or("");
    let mut cmd_w: Vec<u16> = cmd_line_str.encode_utf16().chain(Some(0)).collect();
    let cmd_ptr = if cmd_line_str.is_empty() {
        PWSTR::null()
    } else {
        PWSTR(cmd_w.as_mut_ptr())
    };

    let ok = unsafe {
        CreateProcessAsUserW(
            h_token,
            &app_w,
            cmd_ptr,
            None,
            None,
            BOOL(if wait && capture { 1 } else { 0 }),
            creation_flags,
            Some(env),
            work_dir_pcwstr,
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

    if ok.is_err() {
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
    if !unsafe { CreatePipe(&mut h_read, &mut h_write, None, 0) }.is_ok() {
        bail!("CreatePipe failed");
    }
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
        if !unsafe { WTSEnumerateSessionsW(HANDLE(0), 0, 1, &mut p_session_info, &mut count) }
            .is_ok()
        {
            bail!("WTSEnumerateSessionsW failed");
        }
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
    if !unsafe { WTSQueryUserToken(session_id, &mut h_impersonation_token) }.is_ok() {
        bail!("WTSQueryUserToken failed");
    }

    let mut h_token = HANDLE::default();
    let access = TOKEN_ASSIGN_PRIMARY | TOKEN_DUPLICATE | TOKEN_QUERY | TOKEN_IMPERSONATE;

    if !unsafe {
        DuplicateTokenEx(
            h_impersonation_token,
            access,
            None,
            SecurityImpersonation,
            TokenPrimary,
            &mut h_token,
        )
    }
    .is_ok()
    {
        bail!("DuplicateTokenEx failed");
    }

    unsafe { CloseHandle(h_impersonation_token) };
    Ok(h_token)
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
