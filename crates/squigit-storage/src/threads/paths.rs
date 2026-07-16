// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::path::{Path, PathBuf};

const OCR_ANNOTATIONS_FILE: &str = "ocr_annotations.json";
const CONTEXT_WINDOW_FILE: &str = "context_window.json";
const REVERSE_IMAGE_SEARCH_FILE: &str = "reverse_image_search.json";
const MESSAGES_FILE: &str = "messages.json";
const ATTACHMENT_REGISTRY_FILE: &str = "attachment_registry.json";

pub(super) fn ocr_annotations_path(thread_dir: &Path) -> PathBuf {
    thread_dir.join(OCR_ANNOTATIONS_FILE)
}

pub(super) fn context_window_path(thread_dir: &Path) -> PathBuf {
    thread_dir.join(CONTEXT_WINDOW_FILE)
}

pub(super) fn reverse_image_search_path(thread_dir: &Path) -> PathBuf {
    thread_dir.join(REVERSE_IMAGE_SEARCH_FILE)
}

pub(super) fn messages_path(thread_dir: &Path) -> PathBuf {
    thread_dir.join(MESSAGES_FILE)
}

pub(super) fn attachment_registry_path(thread_dir: &Path) -> PathBuf {
    thread_dir.join(ATTACHMENT_REGISTRY_FILE)
}
