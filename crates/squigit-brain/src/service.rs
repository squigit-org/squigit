// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::runtime::BrainRuntimeState;

#[derive(Clone)]
pub struct ImageThreadCredentialSnapshot {
    credential: crate::provider::credentials::ActiveCredential,
    selected_model: String,
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

    pub fn start_conversation(
        &self,
        job_id: String,
        request: crate::ConversationRequest,
    ) -> Result<String, String> {
        self.start_conversation_with_snapshot(job_id, request, None)
    }

    pub fn start_conversation_with_snapshot(
        &self,
        job_id: String,
        request: crate::ConversationRequest,
        credential: Option<ImageThreadCredentialSnapshot>,
    ) -> Result<String, String> {
        let thread_id = request.conversation.id().to_string();
        let manifest = request.conversation.manifest().clone();
        let job =
            self.runtime
                .worker
                .register(job_id.clone(), thread_id.clone(), "conversation")?;
        job.update(|snapshot| snapshot.grounding.selected_model = request.model.clone());
        if !crate::provider::models::valid_model_id(&request.model)
            || !crate::provider::models::MODEL_EFFORTS.contains(&request.effort.as_str())
        {
            job.finish(Err(crate::provider::errors::ProviderError::new(
                "invalid-model",
            )));
            return Ok(job_id);
        }
        let credential = match credential
            .map(|snapshot| snapshot.credential)
            .map(Ok)
            .unwrap_or_else(crate::provider::credentials::load_current)
        {
            Ok(credential) => credential,
            Err(error) => {
                job.finish(Err(crate::provider::errors::ProviderError::local(&error)));
                return Ok(job_id);
            }
        };
        let runtime = self.runtime.clone();
        tokio::spawn(async move {
            let result = tokio::select! {
                result = async {
                    crate::provider::summaries::start(&runtime, &job, credential.clone(), thread_id, manifest, request.model.clone());
                    crate::provider::conversation::run(&runtime, &job, &credential, request).await
                } => result,
                _ = job.cancellation.cancelled() => Err(crate::provider::errors::ProviderError::new("stopped")),
            };
            job.finish(result);
        });
        Ok(job_id)
    }

    pub fn job_snapshot(&self, job_id: &str) -> Option<crate::JobSnapshot> {
        self.runtime.worker.snapshot(job_id)
    }
    pub fn jobs_snapshot(&self) -> Vec<crate::JobSnapshot> {
        self.runtime.worker.snapshots()
    }
    pub fn cancel_job(&self, job_id: &str) {
        self.runtime.worker.cancel(job_id);
    }

    async fn title(
        &self,
        thread_id: String,
        input: crate::provider::titles::TitleInput,
        credential: Option<crate::provider::credentials::ActiveCredential>,
        selected_model: String,
    ) -> Result<String, String> {
        let job = self
            .runtime
            .worker
            .register(crate::jobs::new_job_id(), thread_id, "title")?;
        job.update(|snapshot| snapshot.grounding.selected_model = selected_model.clone());
        let loaded = match credential {
            Some(credential) => Ok(credential),
            None => tokio::task::spawn_blocking(crate::provider::credentials::load_current)
                .await
                .map_err(|error| error.to_string())
                .and_then(|credential| credential),
        };
        let credential = match loaded {
            Ok(credential) => credential,
            Err(error) => {
                let error = crate::provider::errors::ProviderError::local(&error);
                job.finish(Err(error.clone()));
                return Err(error.user_error().message);
            }
        };
        let result = tokio::select! {
            result = async {
                crate::provider::titles::run(&self.runtime, &job, &credential, input, &selected_model).await
            } => result,
            _ = job.cancellation.cancelled() => Err(crate::provider::errors::ProviderError::new("stopped")),
        };
        job.finish(result.clone());
        result.map_err(|error| error.user_error().message)
    }

    pub async fn suggest_thread_title(
        &self,
        thread_id: String,
        selected_model: String,
    ) -> Result<String, String> {
        let storage = squigit_storage::ThreadStorage::new().map_err(|error| error.to_string())?;
        let conversation = storage
            .load_conversation(&thread_id)
            .map_err(|error| error.to_string())?;
        let selected_model = conversation
            .messages()
            .iter()
            .rev()
            .find_map(|message| match message {
                squigit_storage::ThreadMessage::Assistant {
                    grounding: Some(grounding),
                    ..
                } if crate::provider::models::valid_model_id(&grounding.selected_model) => {
                    Some(grounding.selected_model.clone())
                }
                _ => None,
            })
            .unwrap_or(selected_model);
        let input = if conversation.messages().is_empty() {
            crate::provider::titles::TitleInput::Image(
                storage
                    .get_image_path(conversation.initial_hash())
                    .map_err(|error| error.to_string())?,
            )
        } else {
            crate::provider::titles::TitleInput::Text(
                serde_json::to_string(conversation.messages())
                    .map_err(|error| error.to_string())?,
            )
        };
        self.title(thread_id, input, None, selected_model).await
    }

    pub async fn suggest_thread_title_from_text(
        &self,
        text: String,
        selected_model: String,
    ) -> Result<String, String> {
        self.title(
            String::new(),
            crate::provider::titles::TitleInput::Text(text),
            None,
            selected_model,
        )
        .await
    }

    pub async fn initial_thread_title(
        &self,
        thread_id: String,
        image_path: String,
        snapshot: ImageThreadCredentialSnapshot,
    ) -> Result<String, String> {
        self.title(
            thread_id,
            crate::provider::titles::TitleInput::Image(image_path),
            Some(snapshot.credential),
            snapshot.selected_model,
        )
        .await
    }

    pub async fn initial_sidechat_title(
        &self,
        thread_id: String,
        text: String,
        snapshot: ImageThreadCredentialSnapshot,
    ) -> Result<String, String> {
        self.title(
            thread_id,
            crate::provider::titles::TitleInput::Text(text),
            Some(snapshot.credential),
            snapshot.selected_model,
        )
        .await
    }

    pub async fn capture_image_thread_credential(
        &self,
        selected_model: String,
    ) -> Result<Option<ImageThreadCredentialSnapshot>, String> {
        Ok(
            crate::provider::credentials::capture_image_thread_credential()
                .await?
                .map(|credential| ImageThreadCredentialSnapshot {
                    credential,
                    selected_model,
                }),
        )
    }

    pub async fn build_model_attempt_plan(
        &self,
        model_id: String,
        effort: String,
    ) -> Result<Vec<String>, String> {
        crate::provider::models::build_attempt_plan(&model_id, &effort).await
    }
}

impl Default for BrainService {
    fn default() -> Self {
        Self::new()
    }
}
