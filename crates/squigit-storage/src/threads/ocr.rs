// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::records;
use super::{
    default_ocr_annotations, OcrAnnotationEntry, OcrAnnotations, OcrModelAnnotation, OcrRegion,
    ThreadStorage,
};
use crate::database::json_column;
use crate::{Result, StorageError};
use rusqlite::{params, Connection};

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

pub(super) fn annotations(connection: &Connection, id: &str) -> Result<OcrAnnotations> {
    let mut result = default_ocr_annotations();
    let mut statement = connection.prepare(
        "SELECT model_id, scanned_at, regions_json FROM ocr_results WHERE conversation_id = ?1",
    )?;
    for entry in statement.query_map([id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            OcrModelAnnotation {
                scanned_at: row.get(1)?,
                ocr_data: json_column(row, 2)?,
            },
        ))
    })? {
        let (model, data) = entry?;
        if is_supported_ocr_model_id(&model) {
            result.insert(model, OcrAnnotationEntry::Model(data));
        }
    }
    Ok(result)
}

pub(super) fn put_annotations(
    connection: &Connection,
    id: &str,
    annotations: &OcrAnnotations,
) -> Result<()> {
    connection.execute("DELETE FROM ocr_results WHERE conversation_id = ?1", [id])?;
    for (model_id, annotation) in annotations {
        if !is_supported_ocr_model_id(model_id) {
            continue;
        }
        if let OcrAnnotationEntry::Model(model) = annotation {
            put_model(connection, id, model_id, model)?;
        }
    }
    Ok(())
}

fn put_model(
    connection: &Connection,
    id: &str,
    model_id: &str,
    model: &OcrModelAnnotation,
) -> Result<()> {
    connection.execute("INSERT INTO ocr_results (conversation_id, model_id, scanned_at, regions_json) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (conversation_id, model_id) DO UPDATE SET scanned_at = excluded.scanned_at, regions_json = excluded.regions_json",
        params![id, model_id, model.scanned_at, serde_json::to_string(&model.ocr_data)?])?;
    Ok(())
}

impl ThreadStorage {
    pub fn save_ocr_data(
        &self,
        thread_id: &str,
        model_id: &str,
        ocr_data: &[OcrRegion],
    ) -> Result<()> {
        let model_id = canonicalize_ocr_annotations_id(model_id)
            .ok_or_else(|| StorageError::InvalidOcrModel(model_id.into()))?;
        self.database.write(|connection| {
            records::get_thread(connection, thread_id)?;
            put_model(
                connection,
                thread_id,
                model_id,
                &OcrModelAnnotation {
                    scanned_at: Some(chrono::Utc::now()),
                    ocr_data: ocr_data.to_vec(),
                },
            )
        })
    }

    pub fn get_ocr_annotations(&self, thread_id: &str) -> Result<OcrAnnotations> {
        self.database
            .read(|connection| annotations(connection, thread_id))
    }
}
