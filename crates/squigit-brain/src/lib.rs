// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

pub mod chat;
pub mod context;
pub mod guide;
pub mod provider;
mod runtime;
pub mod service;
mod web;

pub use provider::gemini::attachments::{
    AttachmentPreparationStatus, PrepareAttachmentRequest, PrepareAttachmentResult,
    PrepareSubmissionAttachmentsRequest, PrepareSubmissionAttachmentsResult,
    SubmissionAttachmentResult,
};
pub use service::{BrainService, ImageThreadCredentialSnapshot};
