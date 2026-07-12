// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::ipc::SttCommand;
use crate::paths;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("{0}")]
    Resolve(String),
    #[error("Failed to spawn native STT engine: {0}")]
    Spawn(std::io::Error),
    #[error("Failed to capture native STT stdin")]
    Stdin,
    #[error("Failed to capture native STT stdout")]
    Stdout,
    #[error("Failed to write native STT command: {0}")]
    Write(std::io::Error),
    #[error("Failed to serialize native STT command: {0}")]
    Json(serde_json::Error),
}

pub struct NativeEngine {
    child: Child,
    stdin: ChildStdin,
    reader: Option<JoinHandle<()>>,
}

impl NativeEngine {
    pub fn spawn() -> Result<Self, EngineError> {
        let engine_path = paths::resolve_engine_path().map_err(EngineError::Resolve)?;
        let mut command = Command::new(&engine_path);
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        if let Some(parent) = engine_path.parent() {
            command.current_dir(parent);
        }

        apply_runtime_lib_env(&mut command, &paths::runtime_lib_dirs(&engine_path));

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command.spawn().map_err(EngineError::Spawn)?;
        let stdin = child.stdin.take().ok_or(EngineError::Stdin)?;
        let stdout = child.stdout.take().ok_or(EngineError::Stdout)?;

        let reader = std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let mut out = std::io::stdout().lock();
                let _ = writeln!(out, "{line}");
                let _ = out.flush();
            }
        });

        Ok(Self {
            child,
            stdin,
            reader: Some(reader),
        })
    }

    pub fn send(&mut self, command: &SttCommand) -> Result<(), EngineError> {
        let json = serde_json::to_string(command).map_err(EngineError::Json)?;
        self.stdin
            .write_all(json.as_bytes())
            .map_err(EngineError::Write)?;
        self.stdin.write_all(b"\n").map_err(EngineError::Write)?;
        self.stdin.flush().map_err(EngineError::Write)
    }

    pub fn shutdown(mut self) {
        let _ = self.send(&SttCommand::Quit);
        let _ = self.stdin.flush();
        drop(self.stdin);

        let deadline = Instant::now() + Duration::from_millis(700);
        loop {
            match self.child.try_wait() {
                Ok(Some(_)) => break,
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(25));
                }
                Ok(None) => {
                    let _ = self.child.kill();
                    let _ = self.child.wait();
                    break;
                }
                Err(_) => break,
            }
        }

        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}

fn apply_runtime_lib_env(command: &mut Command, dirs: &[std::path::PathBuf]) {
    if dirs.is_empty() {
        return;
    }

    let key = runtime_lib_env_key();
    let mut values = dirs.to_vec();
    if let Some(existing) = std::env::var_os(key) {
        values.extend(std::env::split_paths(&existing));
    }
    if let Ok(joined) = std::env::join_paths(values) {
        command.env(key, joined);
    }
}

fn runtime_lib_env_key() -> &'static str {
    #[cfg(windows)]
    {
        "PATH"
    }
    #[cfg(target_os = "macos")]
    {
        "DYLD_LIBRARY_PATH"
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        "LD_LIBRARY_PATH"
    }
}
