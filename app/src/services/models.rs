// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

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
    status: String,
}

fn canonical_ocr_model_id(model_id: &str) -> &str {
    match model_id {
        "pp-ocr-v4-en" => "pp-ocr-v5-en",
        "pp-ocr-v4-ru" => "pp-ocr-v5-cyrillic",
        "pp-ocr-v4-ko" => "pp-ocr-v5-korean",
        "pp-ocr-v4-ja" => "pp-ocr-v5-cjk",
        "pp-ocr-v4-zh" => "pp-ocr-v5-cjk",
        "pp-ocr-v4-es" => "pp-ocr-v5-latin",
        "pp-ocr-v4-it" => "pp-ocr-v5-latin",
        "pp-ocr-v4-pt" => "pp-ocr-v5-latin",
        "pp-ocr-v4-hi" => "pp-ocr-v5-devanagari",
        _ => model_id,
    }
}

fn legacy_ocr_model_aliases(canonical_model_id: &str) -> &'static [&'static str] {
    match canonical_model_id {
        "pp-ocr-v5-en" => &["pp-ocr-v4-en"],
        "pp-ocr-v5-cyrillic" => &["pp-ocr-v4-ru"],
        "pp-ocr-v5-korean" => &["pp-ocr-v4-ko"],
        "pp-ocr-v5-cjk" => &["pp-ocr-v4-ja", "pp-ocr-v4-zh"],
        "pp-ocr-v5-latin" => &["pp-ocr-v4-es", "pp-ocr-v4-it", "pp-ocr-v4-pt"],
        "pp-ocr-v5-devanagari" => &["pp-ocr-v4-hi"],
        _ => &[],
    }
}

fn has_model_graph_file(model_dir: &Path) -> bool {
    model_dir.join("inference.pdmodel").exists() || model_dir.join("inference.json").exists()
}

fn is_model_dir_ready(model_dir: &Path) -> bool {
    has_model_graph_file(model_dir) && model_dir.join("inference.pdiparams").exists()
}

pub struct ModelManager {
    models_dir: PathBuf,
    cancellation_tokens: Arc<Mutex<HashMap<String, CancellationToken>>>,
    network_monitor: Arc<crate::services::network::PeerNetworkMonitor>,
}

impl ModelManager {
    fn resolve_legacy_model_dir(&self, canonical_model_id: &str) -> Option<PathBuf> {
        for legacy_id in legacy_ocr_model_aliases(canonical_model_id) {
            let legacy_dir = self.models_dir.join(legacy_id);
            if legacy_dir.exists() && is_model_dir_ready(&legacy_dir) {
                return Some(legacy_dir);
            }
        }
        None
    }

    pub fn new() -> Result<Self> {
        let config_dir = dirs::config_dir().ok_or(ModelError::NoConfigDir)?;
        let models_dir = config_dir
            .join(crate::constants::APP_NAME.to_lowercase())
            .join("Local Storage")
            .join("models");

        fs::create_dir_all(&models_dir)?;

        let network_monitor = Arc::new(crate::services::network::PeerNetworkMonitor::new());

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
        if model_id.is_empty() {
            return self.models_dir.clone();
        }

        let canonical_id = canonical_ocr_model_id(model_id);
        let canonical_dir = self.models_dir.join(canonical_id);
        if canonical_dir.exists() {
            return canonical_dir;
        }

        self.resolve_legacy_model_dir(canonical_id)
            .unwrap_or(canonical_dir)
    }

    fn get_temp_file_path(&self, model_id: &str) -> PathBuf {
        let canonical_id = canonical_ocr_model_id(model_id);
        self.models_dir.join(format!("temp_{}.tar", canonical_id))
    }

    pub fn is_model_installed(&self, model_id: &str) -> bool {
        let dir = self.get_model_dir(model_id);
        dir.exists() && is_model_dir_ready(&dir)
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

        self.cancel_download(model_id);

        let cancel_token = CancellationToken::new();
        if let Ok(mut tokens) = self.cancellation_tokens.lock() {
            tokens.insert(model_id.to_string(), cancel_token.clone());
        }

        let temp_file_path = self.get_temp_file_path(model_id);
        let client = reqwest::Client::new();

        loop {
            if cancel_token.is_cancelled() {
                if let Ok(mut tokens) = self.cancellation_tokens.lock() {
                    tokens.remove(model_id);
                }

                let _ = fs::remove_file(&temp_file_path);
                return Err(ModelError::Cancelled);
            }

            let net_state = self.network_monitor.get_state();
            if net_state.status == crate::services::network::NetworkStatus::Offline {
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

                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                continue;
            }

            let metadata = fs::metadata(&temp_file_path).ok();
            let current_bytes = metadata.map(|m| m.len()).unwrap_or(0);

            let status_str = if current_bytes == 0 {
                "checking"
            } else {
                "downloading"
            };
            let _ = window.emit(
                "download-progress",
                DownloadProgressPayload {
                    id: model_id.to_string(),
                    progress: 0,
                    loaded: current_bytes,
                    total: 0,
                    status: status_str.to_string(),
                },
            );

            match self
                .download_chunk_loop(
                    &client,
                    url,
                    model_id,
                    &temp_file_path,
                    window,
                    &cancel_token,
                )
                .await
            {
                Ok(_) => break,
                Err(ModelError::Cancelled) => {
                    if let Ok(mut tokens) = self.cancellation_tokens.lock() {
                        tokens.remove(model_id);
                    }

                    let _ = fs::remove_file(&temp_file_path);
                    return Err(ModelError::Cancelled);
                }
                Err(e) => {
                    println!("Download chunk failed: {}. Retrying...", e);

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
                    continue;
                }
            }
        }

        if let Ok(mut tokens) = self.cancellation_tokens.lock() {
            tokens.remove(model_id);
        }

        println!("Extracting model {}...", model_id);

        return self
            .perform_extraction(url, model_id, &temp_file_path, &target_dir, window)
            .await;
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
        let mut downloaded_bytes = 0u64;
        let mut file;

        if temp_file_path.exists() {
            let metadata = fs::metadata(temp_file_path)?;
            downloaded_bytes = metadata.len();
            file = File::options().append(true).open(temp_file_path).await?;
        } else {
            file = File::create(temp_file_path).await?;
        }

        let head_resp = client.head(url).send().await?;
        if !head_resp.status().is_success() {
            return Err(ModelError::Network(
                head_resp.error_for_status().unwrap_err(),
            ));
        }
        let total_size = head_resp
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|ct| ct.to_str().ok())
            .and_then(|ct| ct.parse::<u64>().ok())
            .unwrap_or(0);

        if total_size > 0 && downloaded_bytes >= total_size {
            return Ok(());
        }

        let request_builder = client.get(url);
        let response = if downloaded_bytes > 0 {
            request_builder
                .header(RANGE, format!("bytes={}-", downloaded_bytes))
                .send()
                .await?
        } else {
            request_builder.send().await?
        };

        if !response.status().is_success() {
            if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
                return Err(ModelError::Io(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "Range not satisfiable",
                )));
            }
            return Err(ModelError::Network(
                response.error_for_status().unwrap_err(),
            ));
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
            if let Err(_) = self.extract_archive(&mut archive, target_dir) {
                if target_dir.exists() {
                    fs::remove_dir_all(target_dir)?;
                    fs::create_dir_all(target_dir)?;
                }
                let tar_file = fs::File::open(temp_file_path)?;
                let tar_gz = GzDecoder::new(tar_file);
                let mut archive_gz = Archive::new(tar_gz);
                self.extract_archive(&mut archive_gz, target_dir)
                    .map_err(|e| ModelError::Extraction(format!("Failed to extract: {:?}", e)))?;
            }
        }

        fs::remove_file(temp_file_path)?;
        println!(
            "Model {} installed successfully at {:?}",
            model_id, target_dir
        );
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

            if !entry.header().entry_type().is_file() {
                continue;
            }

            if let Some(name) = path.file_name() {
                // Flatten archive paths into model dir; keeps required metadata files
                // (e.g. inference.yml / inference.json) from PP3 model bundles.
                let dest = target_dir.join(name);
                entry.unpack(dest)?;
            }
        }

        if !has_model_graph_file(target_dir) {
            return Err(ModelError::Extraction(
                "Archive did not contain inference.pdmodel or inference.json".to_string(),
            ));
        }

        if !target_dir.join("inference.pdiparams").exists() {
            return Err(ModelError::Extraction(
                "Archive did not contain inference.pdiparams".to_string(),
            ));
        }

        Ok(())
    }
}
