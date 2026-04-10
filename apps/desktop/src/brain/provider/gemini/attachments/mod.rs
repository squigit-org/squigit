// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod cache;
mod detector;
mod docx;
mod mime;
mod parser;
mod parts;
pub mod paths;
mod pdf;
mod types;
mod upload;

pub use cache::ensure_file_uploaded;
pub(crate) use detector::extract_attachment_mentions;
pub(crate) use docx::extract_docx_text;
pub use docx::extract_docx_text_for_prompt;
pub use mime::{is_docx_path, mime_from_extension};
pub(crate) use parser::{
    build_attachment_preview_context, clamp_tool_max_chars, read_local_attachment_context,
    LocalAttachmentContextResult,
};
pub(crate) use parts::build_interleaved_parts;
pub(crate) use pdf::extract_pdf_text;
pub use types::GeminiFileRef;
pub use upload::{poll_file_status, upload_file_to_gemini};
