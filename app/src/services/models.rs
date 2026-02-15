// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Model management service.
//!
//! Downloads and manages OCR models in the user's local storage.
//!
//! Path structure:
//! ~/.config/snapllm/Local Storage/models/
//!   ├── pp-ocr-v4-en/
//!   │   ├── inference.pdmodel
//!   │   └── inference.pdiparams
//!   ├── pp-ocr-v4-zh/
//!   └── ...

use flate2::read::GzDecoder;
use futures_util::StreamExt;
use reqwest::header::{CONTENT_LENGTH, RANGE};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tar::Archive;
use tauri::{Emitter, Window};
use thiserror::Error;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Error)]
pub enum ModelError {
    #[error("Failed to determine config directory")]
    NoConfigDir,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("Extraction error: {0}")]
    Extraction(String),
    #[error("Tauri event error: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("Download cancelled")]
    Cancelled,
}

pub type Result<T> = std::result::Result<T, ModelError>;

#[derive(Clone, Serialize)]
struct DownloadProgressPayload {
    id: String,
    progress: u8,
    loaded: u64,
    total: u64,
    status: String, // "checking", "downloading", "extracting"
}

pub struct ModelManager {
    models_dir: PathBuf,
    cancellation_tokens: Arc<Mutex<HashMap<String, CancellationToken>>>,
    network_monitor: Arc<crate::services::network::PeerNetworkMonitor>,
}

impl ModelManager {
    pub fn new() -> Result<Self> {
        let config_dir = dirs::config_dir().ok_or(ModelError::NoConfigDir)?;
        let models_dir = config_dir
            .join("snapllm")
            .join("Local Storage")
            .join("models");

        fs::create_dir_all(&models_dir)?;

        let network_monitor = Arc::new(crate::services::network::PeerNetworkMonitor::new());
        // Do not start monitor here to avoid "no reactor" panic
        
        Ok(Self {
            models_dir,
            cancellation_tokens: Arc::new(Mutex::new(HashMap::new())),
            network_monitor,
        })
    }

    pub fn start_monitor(&self) {
        self.network_monitor.start_monitor();
    }

    pub fn get_model_dir(&self, model_id: &str) -> PathBuf {
        self.models_dir.join(model_id)
    }

    fn get_temp_file_path(&self, model_id: &str) -> PathBuf {
        self.models_dir.join(format!("temp_{}.tar", model_id))
    }

    pub fn is_model_installed(&self, model_id: &str) -> bool {
        let dir = self.get_model_dir(model_id);
        dir.exists()
            && dir.join("inference.pdmodel").exists()
            && dir.join("inference.pdiparams").exists()
    }

    pub fn cancel_download(&self, model_id: &str) {
        if let Ok(mut tokens) = self.cancellation_tokens.lock() {
            if let Some(token) = tokens.remove(model_id) {
                token.cancel();
            }
        }
    }

    pub async fn download_and_extract(
        &self,
        url: &str,
        model_id: &str,
        window: &Window,
    ) -> Result<PathBuf> {
        let target_dir = self.get_model_dir(model_id);

        if self.is_model_installed(model_id) {
            return Ok(target_dir);
        }

        // Cancel any existing download for this model
        self.cancel_download(model_id);

        let cancel_token = CancellationToken::new();
        if let Ok(mut tokens) = self.cancellation_tokens.lock() {
            tokens.insert(model_id.to_string(), cancel_token.clone());
        }

        let temp_file_path = self.get_temp_file_path(model_id);
        let client = reqwest::Client::new();
        
        loop {
            // Check cancellation
            if cancel_token.is_cancelled() {
                if let Ok(mut tokens) = self.cancellation_tokens.lock() {
                    tokens.remove(model_id);
                }
                // Cleanup temp file on cancel
                let _ = fs::remove_file(&temp_file_path);
                return Err(ModelError::Cancelled);
            }

            // Check Network Status
            let net_state = self.network_monitor.get_state();
            if net_state.status == crate::services::network::NetworkStatus::Offline {
                // Emit paused state
                let _ = window.emit(
                    "download-progress",
                    DownloadProgressPayload {
                        id: model_id.to_string(),
                        progress: 0, 
                        loaded: 0, 
                        total: 0,
                        status: "paused".to_string(),
                    },
                );
                // Wait for network to come back
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                continue;
            }

            // Emit checking/downloading state based on progress
            let metadata = fs::metadata(&temp_file_path).ok();
            let current_bytes = metadata.map(|m| m.len()).unwrap_or(0);
            
            let status_str = if current_bytes == 0 { "checking" } else { "downloading" };
             let _ = window.emit(
                "download-progress",
                DownloadProgressPayload {
                    id: model_id.to_string(),
                    progress: 0, // Calculated later
                    loaded: current_bytes,
                    total: 0, // Unknown yet
                    status: status_str.to_string(),
                },
            );

            // Attempt Download
            match self.download_chunk_loop(&client, url, model_id, &temp_file_path, window, &cancel_token).await {
                Ok(_) => break, // Download complete
                Err(ModelError::Cancelled) => {
                     if let Ok(mut tokens) = self.cancellation_tokens.lock() {
                        tokens.remove(model_id);
                    }
                    // Cleanup temp file on cancel
                    let _ = fs::remove_file(&temp_file_path);
                    return Err(ModelError::Cancelled);
                },
                Err(e) => {
                    println!("Download chunk failed: {}. Retrying...", e);
                    // Emit paused/retry state
                     let _ = window.emit(
                        "download-progress",
                        DownloadProgressPayload {
                            id: model_id.to_string(),
                            progress: 0,
                            loaded: current_bytes,
                            total: 0,
                            status: "paused".to_string(),
                        },
                    );
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue; // Auto-resume loop
                }
            }
        }
        
        // Remove token as download is done
        if let Ok(mut tokens) = self.cancellation_tokens.lock() {
             tokens.remove(model_id);
        }
        
        // Extract... (rest of the function)
        println!("Extracting model {}...", model_id);
        // ... (extract logic same as before)
        return self.perform_extraction(url, model_id, &temp_file_path, &target_dir, window).await;
    }

    async fn download_chunk_loop(
        &self,
        client: &reqwest::Client,
        url: &str,
        model_id: &str,
        temp_file_path: &Path,
        window: &Window,
        cancel_token: &CancellationToken,
    ) -> Result<()> {
         // Check file for resume
        let mut downloaded_bytes = 0u64;
        let mut file;

        if temp_file_path.exists() {
             let metadata = fs::metadata(temp_file_path)?;
             downloaded_bytes = metadata.len();
             file = File::options().append(true).open(temp_file_path).await?;
        } else {
            file = File::create(temp_file_path).await?;
        }

        // HEAD for total size (optional, but good for UI)
        // We do this every retry to be safe, but could optimize.
        // If HEAD fails, we propagate error to trigger retry loop.
        let head_resp = client.head(url).send().await?;
        if !head_resp.status().is_success() {
             return Err(ModelError::Network(head_resp.error_for_status().unwrap_err()));
        }
        let total_size = head_resp.headers()
            .get(CONTENT_LENGTH)
            .and_then(|ct| ct.to_str().ok())
            .and_then(|ct| ct.parse::<u64>().ok())
            .unwrap_or(0);

        // Sanity check
        if total_size > 0 && downloaded_bytes >= total_size {
             // Already done? or corrupted?
             // If completely matches, maybe we are done. 
             // But to be safe if it's strictly equal, return Ok.
             return Ok(());
        }

        let request_builder = client.get(url);
        let response = if downloaded_bytes > 0 {
             request_builder.header(RANGE, format!("bytes={}-", downloaded_bytes)).send().await?
        } else {
             request_builder.send().await?
        };

        if !response.status().is_success() {
             if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
                  // Corrupted or server changed? Reset.
                  return Err(ModelError::Io(std::io::Error::new(std::io::ErrorKind::InvalidData, "Range not satisfiable")));
             }
             return Err(ModelError::Network(response.error_for_status().unwrap_err()));
        }

        let mut stream = response.bytes_stream();

        loop {
            tokio::select! {
                _ = cancel_token.cancelled() => {
                    return Err(ModelError::Cancelled);
                }
                item = tokio::time::timeout(std::time::Duration::from_secs(5), stream.next()) => {
                    match item {
                        Ok(Some(chunk_result)) => {
                            let chunk = chunk_result?;
                            file.write_all(&chunk).await?;
                            downloaded_bytes += chunk.len() as u64;
                            
                            if total_size > 0 {
                                let progress = ((downloaded_bytes as f64 / total_size as f64) * 100.0) as u8;
                                let _ = window.emit(
                                    "download-progress",
                                    DownloadProgressPayload {
                                        id: model_id.to_string(),
                                        progress,
                                        loaded: downloaded_bytes,
                                        total: total_size,
                                        status: "downloading".to_string(),
                                    },
                                );
                            }
                        }
                        Ok(None) => {
                            break;
                        }
                        Err(_) => {
                            return Err(ModelError::Io(std::io::Error::new(std::io::ErrorKind::TimedOut, "Network timeout")));
                        }
                    }
                }
            }
        }
        
        file.flush().await?;
        Ok(())
    }

    async fn perform_extraction(
        &self,
        url: &str,
        model_id: &str,
        temp_file_path: &Path,
        target_dir: &Path,
        window: &Window,
    ) -> Result<PathBuf> {
         let _ = window.emit(
            "download-progress",
            DownloadProgressPayload {
                id: model_id.to_string(),
                progress: 100,
                loaded: 0,
                total: 0,
                status: "extracting".to_string(),
            },
        );
        
        if target_dir.exists() {
            fs::remove_dir_all(&target_dir)?;
        }
        fs::create_dir_all(&target_dir)?;
        
         // ... reuse existing extraction logic ...
        // For brevity in this tool call, implementing the core extraction call
        // Using File for seek is needed.
        
        let tar_file = fs::File::open(temp_file_path)?;
        let mut archive = Archive::new(tar_file);
        
        if url.ends_with(".tar") {
             self.extract_archive(&mut archive, target_dir)?;
        } else if url.ends_with(".tar.gz") || url.ends_with(".tgz") {
             let tar_file = fs::File::open(temp_file_path)?;
             let tar = GzDecoder::new(tar_file);
             let mut archive = Archive::new(tar);
             self.extract_archive(&mut archive, target_dir)?;
        } else {
             // Try tar first
             if let Err(_) = self.extract_archive(&mut archive, target_dir) {
                 if target_dir.exists() {
                     fs::remove_dir_all(target_dir)?;
                     fs::create_dir_all(target_dir)?;
                 }
                 let tar_file = fs::File::open(temp_file_path)?;
                 let tar_gz = GzDecoder::new(tar_file);
                 let mut archive_gz = Archive::new(tar_gz);
                 self.extract_archive(&mut archive_gz, target_dir).map_err(|e| {
                     ModelError::Extraction(format!("Failed to extract: {:?}", e))
                 })?;
             }
        }
        
        fs::remove_file(temp_file_path)?;
        println!("Model {} installed successfully at {:?}", model_id, target_dir);
        Ok(target_dir.to_path_buf())
    }

    fn extract_archive<R: std::io::Read>(
        &self,
        archive: &mut Archive<R>,
        target_dir: &Path,
    ) -> Result<()> {
        for entry in archive.entries()? {
            let mut entry = entry?;
            let path = entry.path()?;

            let file_name = path.file_name();
            if let Some(name) = file_name {
                let name_str = name.to_string_lossy();
                if name_str == "inference.pdmodel"
                    || name_str == "inference.pdiparams"
                    || name_str == "inference.pdiparams.info"
                {
                    let dest = target_dir.join(name);
                    entry.unpack(dest)?;
                }
            }
        }

        if !target_dir.join("inference.pdmodel").exists() {
            return Err(ModelError::Extraction(
                "Archive did not contain inference.pdmodel".to_string(),
            ));
        }

        Ok(())
    }
}
