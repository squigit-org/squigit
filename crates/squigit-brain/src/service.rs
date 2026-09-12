// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::provider::gemini::attachments::{
    GeminiFileRef, PrepareAttachmentRequest, PrepareAttachmentResult,
    PrepareSubmissionAttachmentsRequest, PrepareSubmissionAttachmentsResult,
};
use crate::runtime::BrainRuntimeState;

pub struct ImageThreadCredentialSnapshot {
    credential: crate::provider::gemini::attachments::ActiveCredential,
}

impl std::fmt::Debug for ImageThreadCredentialSnapshot {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("ImageThreadCredentialSnapshot([REDACTED])")
    }
}

pub struct BrainService {
    runtime: BrainRuntimeState,
}

impl BrainService {
    pub fn new() -> Self {
        Self {
            runtime: BrainRuntimeState::new(),
        }
    }

    pub async fn prepare_attachment(
        &self,
        request: PrepareAttachmentRequest,
    ) -> PrepareAttachmentResult {
        crate::provider::gemini::attachments::prepare_attachment(&self.runtime, request).await
    }

    pub async fn attachment_preparation_snapshot(
        &self,
        job_id: &str,
    ) -> Option<PrepareAttachmentResult> {
        crate::provider::gemini::attachments::attachment_preparation_snapshot(&self.runtime, job_id)
            .await
    }

    pub async fn cancel_attachment(&self, job_id: String) -> Result<(), String> {
        crate::provider::gemini::attachments::cancel_attachment(&self.runtime, &job_id).await;
        Ok(())
    }

    pub async fn cancel_all_attachment_jobs(&self) -> Result<(), String> {
        crate::provider::gemini::attachments::cancel_all_attachment_jobs(&self.runtime).await;
        Ok(())
    }

    pub async fn prepare_submission_attachments(
        &self,
        request: PrepareSubmissionAttachmentsRequest,
    ) -> PrepareSubmissionAttachmentsResult {
        crate::provider::gemini::attachments::prepare_submission_attachments(&self.runtime, request)
            .await
    }

    pub async fn suggest_thread_title(
        &self,
        thread_id: String,
        model_candidates: Vec<String>,
    ) -> Result<String, String> {
        crate::provider::gemini::commands::generation::suggest_thread_title(
            &self.runtime,
            thread_id,
            model_candidates,
        )
        .await
    }

    pub async fn suggest_thread_title_from_text(
        &self,
        text: String,
        model_candidates: Vec<String>,
    ) -> Result<String, String> {
        crate::provider::gemini::commands::generation::generate_thread_title_from_text(
            model_candidates,
            text,
        )
        .await
    }

    /// Capture the active Google credential for a complete background lifecycle.
    /// The secret remains opaque to callers and is zeroized with the snapshot.
    pub async fn capture_image_thread_credential(
        &self,
    ) -> Result<Option<ImageThreadCredentialSnapshot>, String> {
        Ok(
            crate::provider::gemini::attachments::capture_image_thread_credential()
                .await?
                .map(|credential| ImageThreadCredentialSnapshot { credential }),
        )
    }

    /// Ensure one canonical CAS image has a valid Gemini Files remote using
    /// exactly the credential captured when the background lifecycle began.
    pub async fn ensure_thread_image_uploaded_with_snapshot(
        &self,
        snapshot: &ImageThreadCredentialSnapshot,
        image_path: String,
    ) -> Result<GeminiFileRef, String> {
        let cancel_token = tokio_util::sync::CancellationToken::new();
        Ok(
            crate::provider::gemini::attachments::ensure_file_uploaded_for_credential(
                &self.runtime,
                &snapshot.credential,
                &image_path,
                &cancel_token,
            )
            .await?
            .file_ref,
        )
    }

    /// Generate an initial title using the same credential snapshot that
    /// resolved or uploaded the Gemini file.
    pub async fn suggest_thread_title_from_file_with_snapshot(
        &self,
        snapshot: &ImageThreadCredentialSnapshot,
        file: GeminiFileRef,
        model_candidates: Vec<String>,
    ) -> Result<String, String> {
        crate::provider::gemini::commands::generation::generate_thread_title_from_image(
            snapshot.credential.api_key(),
            model_candidates,
            file.file_uri,
            file.mime_type,
        )
        .await
    }

    pub async fn build_model_attempt_plan(
        &self,
        model_id: String,
        effort: String,
    ) -> Result<Vec<String>, String> {
        crate::provider::gemini::models::build_attempt_plan(&model_id, &effort)
    }
}

impl Default for BrainService {
    fn default() -> Self {
        Self::new()
    }
}
