// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

pub mod assets;
pub mod context;
pub mod events;
pub mod provider;
pub mod runtime;
pub mod service;
pub mod system;
pub mod tools;

pub use provider::gemini::attachments::{
    AttachmentPreparationError, AttachmentPreparationStatus, PrepareAttachmentRequest,
    PrepareAttachmentResult, PrepareSubmissionAttachmentsRequest,
    PrepareSubmissionAttachmentsResult, SubmissionAttachmentResult,
};
pub use service::{
    AnalyzeImageRequest, BrainService, GenerateThreadTitleRequest, PromptThreadRequest,
    StreamThreadRequest,
};
