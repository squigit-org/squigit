// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];

const GEMINI_DOCUMENT_EXTENSIONS: &[&str] = &["pdf"];

fn normalized_extension(value: &str) -> String {
    std::path::Path::new(value)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or(value)
        .to_ascii_lowercase()
}

pub fn mime_from_extension(ext: &str) -> &str {
    match ext.to_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

pub fn is_image_path(path: &str) -> bool {
    let extension = normalized_extension(path);
    IMAGE_EXTENSIONS.contains(&extension.as_str())
}

pub fn is_gemini_document_path(path: &str) -> bool {
    let extension = normalized_extension(path);
    GEMINI_DOCUMENT_EXTENSIONS.contains(&extension.as_str())
}

pub fn is_gemini_uploadable_path(path: &str) -> bool {
    is_image_path(path) || is_gemini_document_path(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gemini_document_paths_are_detected() {
        assert!(is_gemini_document_path("report.pdf"));
        assert!(!is_gemini_document_path("lecture.docx"));
        assert!(!is_gemini_document_path("main.rs"));
    }

    #[test]
    fn image_paths_are_detected() {
        assert!(is_image_path("objects/ab/hash/hash.png"));
        assert!(is_image_path("/tmp/file.webp"));
        assert!(!is_image_path("objects/ab/hash/hash.docx"));
    }

    #[test]
    fn uploadable_paths_include_images_and_documents() {
        assert!(is_gemini_uploadable_path("figure.png"));
        assert!(is_gemini_uploadable_path("report.pdf"));
        assert!(!is_gemini_uploadable_path("main.rs"));
    }
}
