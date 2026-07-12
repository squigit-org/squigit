// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Node-facing sidecar IPC.
//! Keep STT logic inside the shipped `squigit-stt` CLI; this module only
//! resolves the command, sends protocol messages, and forwards events.

use crate::types::{NapiSttEvent, NapiSttOptions};
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::{Error, Result};
use napi_derive::napi;
use serde::Deserialize;
use serde_json::json;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

const DEFAULT_MODEL: &str = "ggml-tiny.en.bin";
const DEFAULT_LANGUAGE: &str = "en";

static STT_SESSION: OnceLock<Mutex<Option<SttSession>>> = OnceLock::new();

struct SttSession {
    child: Child,
    stdin: ChildStdin,
    reader: Option<JoinHandle<()>>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum RawSttEvent {
    Status { status: String },
    Transcription { text: String, is_final: bool },
    Error { message: String },
}

impl From<RawSttEvent> for NapiSttEvent {
    fn from(event: RawSttEvent) -> Self {
        match event {
            RawSttEvent::Status { status } => Self {
                event_type: "status".to_string(),
                text: None,
                is_final: None,
                status: Some(status),
                message: None,
            },
            RawSttEvent::Transcription { text, is_final } => Self {
                event_type: "transcription".to_string(),
                text: Some(text),
                is_final: Some(is_final),
                status: None,
                message: None,
            },
            RawSttEvent::Error { message } => Self {
                event_type: "error".to_string(),
                text: None,
                is_final: None,
                status: None,
                message: Some(message),
            },
        }
    }
}

#[napi(js_name = "start_stt")]
pub async fn start_stt(
    options: Option<NapiSttOptions>,
    #[napi(ts_arg_type = "(err: null | Error, event: NapiSttEvent) => void")]
    on_event: ThreadsafeFunction<NapiSttEvent>,
) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let mut guard = session_slot()
            .lock()
            .map_err(|_| Error::from_reason("ERR_STT_SESSION_LOCK"))?;

        if guard.is_some() {
            return Err(Error::from_reason("ERR_STT_ALREADY_RUNNING"));
        }

        let binary = resolve_stt_binary().map_err(Error::from_reason)?;
        let mut child = spawn_stt(&binary).map_err(Error::from_reason)?;
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| Error::from_reason("Failed to capture squigit-stt stdin"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| Error::from_reason("Failed to capture squigit-stt stdout"))?;

        let reader = std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(std::result::Result::ok) {
                if line.trim().is_empty() {
                    continue;
                }
                let event = serde_json::from_str::<RawSttEvent>(&line)
                    .map(NapiSttEvent::from)
                    .unwrap_or_else(|error| NapiSttEvent {
                        event_type: "error".to_string(),
                        text: None,
                        is_final: None,
                        status: None,
                        message: Some(format!("Failed to parse STT event: {error}")),
                    });
                on_event.call(Ok(event), ThreadsafeFunctionCallMode::NonBlocking);
            }
        });

        let options = options.unwrap_or(NapiSttOptions {
            model: None,
            language: None,
        });
        let command = json!({
            "command": "start",
            "model": non_empty_or(options.model, DEFAULT_MODEL),
            "language": non_empty_or(options.language, DEFAULT_LANGUAGE),
        });

        if let Err(error) = writeln!(stdin, "{command}") {
            let _ = child.kill();
            let _ = child.wait();
            return Err(Error::from_reason(format!(
                "Failed to start squigit-stt: {error}"
            )));
        }
        stdin
            .flush()
            .map_err(|error| Error::from_reason(format!("Failed to flush squigit-stt: {error}")))?;

        *guard = Some(SttSession {
            child,
            stdin,
            reader: Some(reader),
        });

        Ok(())
    })
    .await
    .unwrap_or_else(|error| Err(Error::from_reason(error.to_string())))
}

#[napi(js_name = "stop_stt")]
pub async fn stop_stt() -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let session = session_slot()
            .lock()
            .map_err(|_| Error::from_reason("ERR_STT_SESSION_LOCK"))?
            .take();

        if let Some(session) = session {
            shutdown_session(session);
        }

        Ok(())
    })
    .await
    .unwrap_or_else(|error| Err(Error::from_reason(error.to_string())))
}

pub fn read_stt_version() -> Result<String> {
    let binary = resolve_stt_binary().map_err(Error::from_reason)?;
    let mut command = Command::new(binary);
    command.arg("--version");

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    let output = command
        .output()
        .map_err(|error| Error::from_reason(error.to_string()))?;
    if !output.status.success() {
        return Err(Error::from_reason("Sidecar command failed"));
    }

    Ok(String::from_utf8_lossy(&output.stdout)
        .trim()
        .lines()
        .last()
        .unwrap_or("")
        .trim()
        .to_string())
}

fn session_slot() -> &'static Mutex<Option<SttSession>> {
    STT_SESSION.get_or_init(|| Mutex::new(None))
}

fn spawn_stt(binary: &Path) -> std::result::Result<Child, String> {
    let mut command = Command::new(binary);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }

    command
        .spawn()
        .map_err(|error| format!("Failed to spawn squigit-stt: {error}"))
}

fn shutdown_session(mut session: SttSession) {
    let _ = writeln!(session.stdin, "{}", json!({ "command": "quit" }));
    let _ = session.stdin.flush();
    drop(session.stdin);

    let deadline = Instant::now() + Duration::from_millis(700);
    loop {
        match session.child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            Ok(None) => {
                let _ = session.child.kill();
                let _ = session.child.wait();
                break;
            }
            Err(_) => break,
        }
    }

    if let Some(reader) = session.reader.take() {
        let _ = reader.join();
    }
}

fn resolve_stt_binary() -> std::result::Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("SQUIGIT_STT_BIN") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
    }

    let name = stt_binary_name();
    if let Some(path) = find_on_path(name) {
        return Ok(path);
    }

    #[cfg(target_os = "macos")]
    {
        for path in [
            PathBuf::from("/opt/homebrew/bin/squigit-stt"),
            PathBuf::from("/usr/local/bin/squigit-stt"),
        ] {
            if path.is_file() {
                return Ok(path);
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let path = PathBuf::from(local_app_data)
                .join("Microsoft")
                .join("WindowsApps")
                .join("squigit-stt.exe");
            if path.is_file() {
                return Ok(path);
            }
        }
    }

    for root in candidate_repo_roots() {
        let path = root
            .join("packaging")
            .join("binaries")
            .join(format!("whisper-stt-{}", host_triple()))
            .join(name);
        if path.is_file() {
            return Ok(path);
        }
    }

    Err("ERR_MISSING_STT_PACKAGE".to_string())
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|path| path.is_file())
}

fn candidate_repo_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        push_ancestors(&mut roots, &cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            push_ancestors(&mut roots, parent);
        }
    }
    roots
}

fn push_ancestors(roots: &mut Vec<PathBuf>, start: &Path) {
    for candidate in start.ancestors() {
        if candidate.join("xtask.toml").is_file()
            && candidate.join("sidecars").join("whisper-stt").is_dir()
            && !roots.iter().any(|root| root == candidate)
        {
            roots.push(candidate.to_path_buf());
        }
    }
}

fn stt_binary_name() -> &'static str {
    if cfg!(windows) {
        "squigit-stt.exe"
    } else {
        "squigit-stt"
    }
}

fn host_triple() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "x86_64-pc-windows-msvc"
    }
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    {
        "aarch64-pc-windows-msvc"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "aarch64-apple-darwin"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "x86_64-apple-darwin"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "x86_64-unknown-linux-gnu"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "aarch64-unknown-linux-gnu"
    }
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64")
    )))]
    {
        "unknown"
    }
}

fn non_empty_or(value: Option<String>, fallback: &str) -> String {
    value
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| fallback.to_string())
}
