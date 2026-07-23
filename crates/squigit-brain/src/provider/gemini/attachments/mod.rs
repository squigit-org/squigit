// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod cache;
mod manifest;
mod mime;
mod parts;
pub mod paths;
mod types;
mod upload;

pub use cache::ensure_file_uploaded;
#[allow(unused_imports)]
pub(crate) use manifest::{
    build_attachment_manifest_context, load_attachment_display_names, prepare_turn_attachments,
    recall_thread_attachment, RecallThreadAttachmentOutcome,
};
pub use mime::{
    is_gemini_document_path, is_gemini_uploadable_path, is_image_path, mime_from_extension,
};
pub(crate) use parts::build_interleaved_parts;
pub use types::GeminiFileRef;
pub use upload::{poll_file_status, upload_file_to_gemini};
