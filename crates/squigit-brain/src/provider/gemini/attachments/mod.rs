// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod cache;
mod lifecycle;
mod mime;
mod paths;
mod types;
mod upload;

pub(crate) use cache::{
    capture_image_thread_credential, ensure_file_uploaded, ensure_file_uploaded_for_credential,
    load_active_api_key, ActiveCredential,
};
pub(crate) use lifecycle::{
    attachment_preparation_snapshot, cancel_all_attachment_jobs, cancel_attachment,
    prepare_attachment, prepare_submission_attachments, AttachmentPreparationJob,
    SharedAttachmentWork,
};
pub use lifecycle::{
    AttachmentPreparationStatus, PrepareAttachmentRequest, PrepareAttachmentResult,
    PrepareSubmissionAttachmentsRequest, PrepareSubmissionAttachmentsResult,
    SubmissionAttachmentResult,
};
pub use mime::mime_from_extension;
pub use types::GeminiFileRef;
