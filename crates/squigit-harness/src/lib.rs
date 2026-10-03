// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

pub mod images;
pub mod parser;
pub mod tools;

use office2pdf::config::{ConvertOptions, Format};
use squigit_storage::{AttachmentFileType, DocumentConversion, ThreadStorage};

const OFFICE_DOCUMENT_EXTENSIONS: &[&str] = &["docx", "xlsx", "pptx"];
const SUPPORTED_DOCUMENT_EXTENSIONS: &[&str] = &["pdf", "docx", "xlsx", "pptx"];
const DOCUMENT_CONVERSION_RECIPE: &str = "office2pdf-0.8.0-default";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PrepareDocumentInput {
    pub bytes: Vec<u8>,
    pub extension: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedDocument {
    pub pdf_bytes: Vec<u8>,
    pub warning_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedDocumentObject {
    pub pdf_hash: String,
    pub cas_path: String,
}

fn active_storage() -> Result<ThreadStorage, String> {
    ThreadStorage::new().map_err(|error| error.to_string())
}

fn normalized_extension(extension: &str) -> String {
    extension
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase()
}

pub fn is_office_document_extension(extension: &str) -> bool {
    let extension = normalized_extension(extension);
    OFFICE_DOCUMENT_EXTENSIONS.contains(&extension.as_str())
}

pub fn is_supported_document_extension(extension: &str) -> bool {
    let extension = normalized_extension(extension);
    SUPPORTED_DOCUMENT_EXTENSIONS.contains(&extension.as_str())
}

fn validate_pdf(bytes: &[u8]) -> Result<(), String> {
    if bytes.starts_with(b"%PDF-") {
        Ok(())
    } else {
        Err("Attachment does not contain a valid PDF header".to_string())
    }
}

pub fn prepare_document(input: PrepareDocumentInput) -> Result<PreparedDocument, String> {
    let extension = normalized_extension(&input.extension);
    if extension == "pdf" {
        validate_pdf(&input.bytes)?;
        return Ok(PreparedDocument {
            pdf_bytes: input.bytes,
            warning_count: 0,
        });
    }

    let format = match extension.as_str() {
        "docx" => Format::Docx,
        "xlsx" => Format::Xlsx,
        "pptx" => Format::Pptx,
        _ => {
            return Err(format!(
                "Unsupported document extension: {}",
                input.extension
            ))
        }
    };
    let converted = office2pdf::convert_bytes(&input.bytes, format, &ConvertOptions::default())
        .map_err(|error| format!("Office conversion failed: {error}"))?;
    validate_pdf(&converted.pdf)?;
    Ok(PreparedDocument {
        pdf_bytes: converted.pdf,
        warning_count: converted.warnings.len(),
    })
}

pub fn find_prepared_office_document(
    source_hash: &str,
    source_extension: &str,
) -> Result<Option<PreparedDocumentObject>, String> {
    if !is_office_document_extension(source_extension) {
        return Err(format!(
            "Unsupported Office document extension: {source_extension}"
        ));
    }
    let storage = active_storage()?;
    let Some(conversion) = storage
        .load_document_conversion(source_hash, source_extension)
        .map_err(|error| error.to_string())?
    else {
        return Ok(None);
    };
    if conversion.recipe != DOCUMENT_CONVERSION_RECIPE {
        return Ok(None);
    }
    let pdf_path = match storage.find_object_blob(&conversion.pdf_hash) {
        Ok(path) => path,
        Err(_) => return Ok(None),
    };
    if pdf_path.extension().and_then(|value| value.to_str()) != Some("pdf") {
        return Ok(None);
    }
    let manifest = match storage.load_object_manifest(&conversion.pdf_hash) {
        Ok(manifest) => manifest,
        Err(_) => return Ok(None),
    };
    if manifest.file_context.file_type != AttachmentFileType::Document {
        return Ok(None);
    }
    Ok(Some(PreparedDocumentObject {
        pdf_hash: conversion.pdf_hash,
        cas_path: pdf_path.to_string_lossy().to_string(),
    }))
}

pub fn remember_prepared_office_document(
    source_hash: &str,
    source_extension: &str,
    pdf_hash: &str,
) -> Result<(), String> {
    if !is_office_document_extension(source_extension) {
        return Err(format!(
            "Unsupported Office document extension: {source_extension}"
        ));
    }
    let storage = active_storage()?;
    let pdf_path = storage
        .find_object_blob(pdf_hash)
        .map_err(|error| error.to_string())?;
    if pdf_path.extension().and_then(|value| value.to_str()) != Some("pdf") {
        return Err("Prepared Office document does not point to a PDF object".to_string());
    }
    let manifest = storage
        .load_object_manifest(pdf_hash)
        .map_err(|error| error.to_string())?;
    if manifest.file_context.file_type != AttachmentFileType::Document {
        return Err("Prepared Office document is not classified as a document upload".to_string());
    }
    storage
        .save_document_conversion(&DocumentConversion {
            source_hash: source_hash.to_ascii_lowercase(),
            source_extension: normalized_extension(source_extension),
            pdf_hash: pdf_hash.to_ascii_lowercase(),
            recipe: DOCUMENT_CONVERSION_RECIPE.to_string(),
        })
        .map_err(|error| error.to_string())
}
