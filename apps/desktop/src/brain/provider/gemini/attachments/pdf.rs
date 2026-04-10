// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

pub(crate) async fn extract_pdf_text(file_path: &str) -> Result<String, String> {
    let bytes = tokio::fs::read(file_path)
        .await
        .map_err(|e| format!("Failed to read PDF file: {}", e))?;

    tokio::task::spawn_blocking(move || {
        pdf_extract::extract_text_from_mem(&bytes)
            .map_err(|e| format!("Failed to extract PDF text: {}", e))
    })
    .await
    .map_err(|e| format!("PDF extraction task failed: {}", e))?
}
