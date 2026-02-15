// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::services::models::ModelManager;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelStatus {
    pub id: String,
    pub path: String,
    pub size: u64,
}

#[tauri::command]
pub async fn download_ocr_model(url: String, filename: String) -> Result<String, String> {
    println!("Downloading OCR model: {} -> {}", url, filename);

    let manager = ModelManager::new().map_err(|e| e.to_string())?;
    let path = manager
        .download_and_extract(&url, &filename)
        .await
        .map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_downloaded_models() -> Result<Vec<String>, String> {
    let manager = ModelManager::new().map_err(|e| e.to_string())?;
    let dir = manager.get_model_dir("");

    let mut models = Vec::new();

    if dir.exists() {
        for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.is_dir() {
                if path.join("inference.pdmodel").exists() {
                    if let Some(name) = path.file_name() {
                        models.push(name.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    Ok(models)
}

#[tauri::command]
pub fn get_model_path(model_id: String) -> Result<String, String> {
    let manager = ModelManager::new().map_err(|e| e.to_string())?;
    let path = manager.get_model_dir(&model_id);
    if path.exists() {
        Ok(path.to_string_lossy().to_string())
    } else {
        Err(format!("Model {} not found", model_id))
    }
}
