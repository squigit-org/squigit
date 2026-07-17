// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::fs;

use crate::error::{Result, StorageError};

use super::paths::ocr_annotations_path;
use super::{
    default_ocr_annotations, OcrAnnotationEntry, OcrAnnotations, OcrModelAnnotation, OcrRegion,
    ThreadStorage, EMPTY_STATE_ASSET_ID,
};

fn is_supported_ocr_model_id(model_id: &str) -> bool {
    matches!(
        model_id,
        "pp-ocr-v5-en"
            | "pp-ocr-v5-latin"
            | "pp-ocr-v5-cyrillic"
            | "pp-ocr-v5-korean"
            | "pp-ocr-v5-cjk"
            | "pp-ocr-v5-devanagari"
    )
}

fn canonicalize_ocr_annotations_id(model_id: &str) -> Option<&str> {
    let trimmed = model_id.trim();
    if trimmed.is_empty() {
        return None;
    }
    if is_supported_ocr_model_id(trimmed) {
        return Some(trimmed);
    }
    None
}

pub(super) fn retain_supported_ocr_annotations_ids(annotations: &mut OcrAnnotations) -> bool {
    let unsupported_keys: Vec<String> = annotations
        .keys()
        .filter(|key| key.as_str() != EMPTY_STATE_ASSET_ID && !is_supported_ocr_model_id(key))
        .cloned()
        .collect();

    for key in &unsupported_keys {
        annotations.remove(key);
    }

    !unsupported_keys.is_empty()
}

pub(super) fn ensure_empty_state_asset(annotations: &mut OcrAnnotations) -> bool {
    if matches!(
        annotations.get(EMPTY_STATE_ASSET_ID),
        Some(OcrAnnotationEntry::EmptyState(_))
    ) {
        return false;
    }

    annotations.insert(
        EMPTY_STATE_ASSET_ID.to_string(),
        OcrAnnotationEntry::EmptyState(Vec::new()),
    );
    true
}

impl ThreadStorage {
    /// Save OCR data for a specific model into the thread's OCR annotations.
    pub fn save_ocr_data(
        &self,
        thread_id: &str,
        model_id: &str,
        ocr_data: &[OcrRegion],
    ) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        fs::create_dir_all(&thread_dir)?;
        let canonical_model_id = canonicalize_ocr_annotations_id(model_id)
            .ok_or_else(|| StorageError::InvalidOcrModel(model_id.to_string()))?;

        let ocr_path = ocr_annotations_path(&thread_dir);
        let mut annotations: OcrAnnotations = if ocr_path.exists() {
            let json = fs::read_to_string(&ocr_path)?;
            serde_json::from_str(&json)?
        } else {
            default_ocr_annotations()
        };
        ensure_empty_state_asset(&mut annotations);
        retain_supported_ocr_annotations_ids(&mut annotations);

        annotations.insert(
            canonical_model_id.to_string(),
            OcrAnnotationEntry::Model(OcrModelAnnotation {
                scanned_at: Some(chrono::Utc::now()),
                ocr_data: ocr_data.to_vec(),
            }),
        );

        fs::write(&ocr_path, serde_json::to_string_pretty(&annotations)?)?;
        Ok(())
    }

    /// Get OCR data for a specific model from the thread's annotations.
    pub fn get_ocr_data(&self, thread_id: &str, model_id: &str) -> Result<Option<Vec<OcrRegion>>> {
        let thread_dir = self.thread_dir(thread_id);
        let ocr_path = ocr_annotations_path(&thread_dir);
        let canonical_model_id = canonicalize_ocr_annotations_id(model_id)
            .ok_or_else(|| StorageError::InvalidOcrModel(model_id.to_string()))?;

        if !ocr_path.exists() {
            return Ok(None);
        }

        let json = fs::read_to_string(&ocr_path)?;
        let mut annotations: OcrAnnotations = serde_json::from_str(&json)?;
        let mut annotations_changed = ensure_empty_state_asset(&mut annotations);
        if retain_supported_ocr_annotations_ids(&mut annotations) {
            annotations_changed = true;
        }
        if annotations_changed {
            fs::write(&ocr_path, serde_json::to_string_pretty(&annotations)?)?;
        }

        let data = annotations
            .get(canonical_model_id)
            .and_then(|entry| match entry {
                OcrAnnotationEntry::Model(model) if model.scanned_at.is_some() => {
                    Some(model.ocr_data.clone())
                }
                _ => None,
            });
        Ok(data)
    }

    /// Get the entire OCR annotations for a thread.
    pub fn get_ocr_annotations(&self, thread_id: &str) -> Result<OcrAnnotations> {
        let thread_dir = self.thread_dir(thread_id);
        let ocr_path = ocr_annotations_path(&thread_dir);

        if !ocr_path.exists() {
            return Ok(default_ocr_annotations());
        }

        let json = fs::read_to_string(&ocr_path)?;
        let mut annotations: OcrAnnotations = serde_json::from_str(&json)?;
        let mut annotations_changed = ensure_empty_state_asset(&mut annotations);
        if retain_supported_ocr_annotations_ids(&mut annotations) {
            annotations_changed = true;
        }
        if annotations_changed {
            fs::write(&ocr_path, serde_json::to_string_pretty(&annotations)?)?;
        }
        Ok(annotations)
    }

    /// Initialize OCR annotations with empty entries for all given model IDs.
    pub fn init_ocr_annotations(&self, thread_id: &str, model_ids: &[String]) -> Result<()> {
        let thread_dir = self.thread_dir(thread_id);
        fs::create_dir_all(&thread_dir)?;

        let ocr_path = ocr_annotations_path(&thread_dir);
        let mut annotations: OcrAnnotations = if ocr_path.exists() {
            let json = fs::read_to_string(&ocr_path)?;
            serde_json::from_str(&json)?
        } else {
            default_ocr_annotations()
        };
        ensure_empty_state_asset(&mut annotations);
        retain_supported_ocr_annotations_ids(&mut annotations);

        for model_id in model_ids {
            let canonical_model_id = canonicalize_ocr_annotations_id(model_id)
                .ok_or_else(|| StorageError::InvalidOcrModel(model_id.clone()))?;
            annotations
                .entry(canonical_model_id.to_string())
                .or_insert(OcrAnnotationEntry::Model(OcrModelAnnotation {
                    scanned_at: None,
                    ocr_data: Vec::new(),
                }));
        }

        fs::write(&ocr_path, serde_json::to_string_pretty(&annotations)?)?;
        Ok(())
    }
}
