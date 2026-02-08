// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Service: Speech Engine
//!
//! Orchestrates the Whisper C++ sidecar for local speech-to-text.
//!
//! Usage:
//! ```no_run
//! let engine = SpeechEngine::new(binary_path);
//! let mut rx = engine.start("model.bin", "en").await?;
//! while let Some(event) = rx.recv().await {
//!    // Handle event
//! }
//! ```

pub mod ipc;
pub mod process;
pub mod state;

use std::path::PathBuf;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::mpsc;

use ipc::{SttCommand, SttEvent};
use process::SidecarProcess;

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("Process error: {0}")]
    Process(#[from] process::ProcessError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Engine already running")]
    AlreadyRunning,
    #[error("Engine not running")]
    NotRunning,
}

pub type Result<T> = std::result::Result<T, EngineError>;

pub struct SpeechEngine {
    binary_path: PathBuf,
    process: Option<SidecarProcess>,
}

impl SpeechEngine {
    pub fn new(binary_path: PathBuf) -> Self {
        Self {
            binary_path,
            process: None,
        }
    }

    /// Start the engine and return a receiver for events.
    /// This launches the sidecar and sends the Start command.
    pub async fn start(&mut self, model_path: String, language: String) -> Result<mpsc::Receiver<SttEvent>> {
        if self.process.is_some() {
            return Err(EngineError::AlreadyRunning);
        }

        // 1. Spawn Process
        let (mut process, stdout) = SidecarProcess::spawn(&self.binary_path)?;
        
        // 2. Send Start Command
        let cmd = SttCommand::Start {
            model: model_path,
            language,
            device_index: None,
        };
        let json = serde_json::to_string(&cmd)?;
        process.stdin.write_all(json.as_bytes()).await?;
        process.stdin.write_all(b"
").await?;
        process.stdin.flush().await?;

        self.process = Some(process);

        // 3. Setup Reading Loop
        let (tx, rx) = mpsc::channel(100);
        
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() { continue; }

                match serde_json::from_str::<SttEvent>(&line) {
                    Ok(event) => {
                        if tx.send(event).await.is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to parse sidecar output: {} | Line: {}", e, line);
                    }
                }
            }
        });

        Ok(rx)
    }

    /// Stop the engine (sends Quit and kills process).
    pub async fn stop(&mut self) -> Result<()> {
        if let Some(mut process) = self.process.take() {
            // Try graceful quit
            let cmd = SttCommand::Quit;
            let json = serde_json::to_string(&cmd)?;
            let _ = process.stdin.write_all(json.as_bytes()).await;
            let _ = process.stdin.write_all(b"
").await;
            let _ = process.stdin.flush().await;

            // Wait a bit or kill
            // For now, just wait for the OS to cleanup or we can explicitly kill if needed
            // But since we dropped the stdin handle, the sidecar loop reading stdin might fail/EOF and exit.
            // Let's ensure it's dead.
            let _ = process.kill().await;
            let _ = process.child.wait().await;
            
            Ok(())
        } else {
            Err(EngineError::NotRunning)
        }
    }
}
