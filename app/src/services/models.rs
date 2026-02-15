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
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tar::Archive;
use thiserror::Error;

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
}

pub type Result<T> = std::result::Result<T, ModelError>;

pub struct ModelManager {
    models_dir: PathBuf,
}

impl ModelManager {
    pub fn new() -> Result<Self> {
        let config_dir = dirs::config_dir().ok_or(ModelError::NoConfigDir)?;
        let models_dir = config_dir
            .join("snapllm")
            .join("Local Storage")
            .join("models");

        fs::create_dir_all(&models_dir)?;

        Ok(Self { models_dir })
    }

    pub fn get_model_dir(&self, model_id: &str) -> PathBuf {
        self.models_dir.join(model_id)
    }

    pub fn is_model_installed(&self, model_id: &str) -> bool {
        let dir = self.get_model_dir(model_id);
        dir.exists()
            && dir.join("inference.pdmodel").exists()
            && dir.join("inference.pdiparams").exists()
    }

    pub async fn download_and_extract(&self, url: &str, model_id: &str) -> Result<PathBuf> {
        let target_dir = self.get_model_dir(model_id);

        if self.is_model_installed(model_id) {
            return Ok(target_dir);
        }

        if target_dir.exists() {
            fs::remove_dir_all(&target_dir)?;
        }
        fs::create_dir_all(&target_dir)?;

        println!("Downloading model {} from {}", model_id, url);
        println!("Downloading model {} from {}", model_id, url);
        let response = reqwest::get(url).await?;

        if !response.status().is_success() {
            return Err(ModelError::Network(
                response.error_for_status().unwrap_err(),
            ));
        }

        let bytes = response.bytes().await?;

        println!("Extracting model {}...", model_id);

        let cursor = Cursor::new(bytes.clone());

        if url.ends_with(".tar") {
            let mut archive = Archive::new(cursor);
            self.extract_archive(&mut archive, &target_dir)?;
        } else if url.ends_with(".tar.gz") || url.ends_with(".tgz") {
            let tar = GzDecoder::new(std::io::BufReader::new(cursor));
            let mut archive = Archive::new(tar);
            self.extract_archive(&mut archive, &target_dir)?;
        } else {
            let cursor_tar = Cursor::new(bytes.clone());
            let mut archive_tar = Archive::new(cursor_tar);
            if let Err(_) = self.extract_archive(&mut archive_tar, &target_dir) {
                if target_dir.exists() {
                    fs::remove_dir_all(&target_dir)?;
                    fs::create_dir_all(&target_dir)?;
                }
                let cursor_gz = Cursor::new(bytes);
                let tar_gz = GzDecoder::new(std::io::BufReader::new(cursor_gz));
                let mut archive_gz = Archive::new(tar_gz);
                self.extract_archive(&mut archive_gz, &target_dir)
                    .map_err(|e| {
                        ModelError::Extraction(format!(
                            "Failed to extract as tar or tar.gz: {:?}",
                            e
                        ))
                    })?;
            }
        }

        println!(
            "Model {} installed successfully at {:?}",
            model_id, target_dir
        );
        Ok(target_dir)
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
