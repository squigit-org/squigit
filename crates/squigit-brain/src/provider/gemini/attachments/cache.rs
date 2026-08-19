// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::Utc;
use squigit_auth::security::{
    get_decrypted_api_key, object_remote_id, ApiKeyProvider, DecryptedApiKey,
};
use squigit_storage::{ObjectRemote, ProfileStore, ThreadStorage};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

use crate::runtime::BrainRuntimeState;

use super::types::GeminiFileObject;
use super::{mime_from_extension, GeminiFileRef};

#[derive(Clone)]
pub(crate) struct ActiveCredential {
    credential: Arc<DecryptedApiKey>,
}

impl std::fmt::Debug for ActiveCredential {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("ActiveCredential([REDACTED])")
    }
}

impl ActiveCredential {
    pub(crate) fn new(credential: DecryptedApiKey) -> Self {
        Self {
            credential: Arc::new(credential),
        }
    }

    pub(crate) fn api_key(&self) -> &str {
        self.credential.api_key.expose()
    }

    pub(crate) fn matches(&self, other: &Self) -> bool {
        self.credential
            .runtime_digest
            .matches(&other.credential.runtime_digest)
    }

    pub(crate) async fn object_remote_id(&self, object_hash: &str) -> Result<String, String> {
        let credential = self.credential.clone();
        let object_hash = object_hash.to_string();
        tokio::task::spawn_blocking(move || {
            object_remote_id(
                ApiKeyProvider::GoogleAiStudio,
                &object_hash,
                &credential.api_key,
            )
            .map_err(|error| error.to_string())
        })
        .await
        .map_err(|error| format!("remote credential task failed: {error}"))?
    }

    #[cfg(test)]
    pub(crate) fn for_test(api_key: &str) -> Self {
        Self {
            credential: Arc::new(DecryptedApiKey {
                api_key: squigit_auth::security::SecretString::new(api_key.to_owned()),
                runtime_digest: squigit_auth::security::CredentialDigest::from_bytes([7; 32]),
            }),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RemoteDisposition {
    Reused,
    Uploaded,
}

impl RemoteDisposition {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Reused => "remote-reused",
            Self::Uploaded => "remote-uploaded",
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct EnsuredFile {
    pub(crate) file_ref: GeminiFileRef,
    pub(crate) disposition: RemoteDisposition,
}

pub(crate) async fn load_active_credential() -> Result<ActiveCredential, String> {
    tokio::task::spawn_blocking(|| {
        let store = ProfileStore::new().map_err(|error| error.to_string())?;
        let profile_id = store
            .get_active_profile_id()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "No active profile is available for attachment uploads".to_string())?;
        let credential = get_decrypted_api_key(&store, ApiKeyProvider::GoogleAiStudio, &profile_id)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "The active profile has no Google AI Studio key".to_string())?;

        Ok(ActiveCredential::new(credential))
    })
    .await
    .map_err(|error| format!("credential lookup task failed: {error}"))?
}

pub(crate) async fn load_active_api_key() -> Result<String, String> {
    Ok(load_active_credential().await?.api_key().to_owned())
}

pub(crate) async fn active_credential(api_key: &str) -> Result<ActiveCredential, String> {
    let credential = load_active_credential().await?;
    if credential.api_key() != api_key.trim() {
        return Err("The request key does not match the active profile key".to_string());
    }
    Ok(credential)
}

fn file_ref_from_remote(remote: &ObjectRemote, display_name: String) -> GeminiFileRef {
    GeminiFileRef {
        file_uri: remote.file_uri.clone(),
        file_name: remote.file_name.clone(),
        mime_type: remote.mime_type.clone(),
        display_name,
        uploaded_at: remote.uploaded_at,
        expires_at: remote.expires_at,
    }
}

async fn validate_remote(
    api_key: &str,
    file_name: &str,
    cancel_token: &CancellationToken,
) -> Result<bool, String> {
    if file_name.trim().is_empty() {
        return Ok(false);
    }
    let response = tokio::select! {
        result = reqwest::Client::new()
            .get(format!("https://generativelanguage.googleapis.com/v1beta/{file_name}"))
            .header("x-goog-api-key", api_key)
            .send() => {
                result.map_err(|_| "TRANSIENT: Gemini file validation failed".to_string())?
            }
        _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
    };
    let status = response.status();
    if status.is_server_error() {
        return Err(format!(
            "TRANSIENT: Gemini file validation temporarily failed ({})",
            status
        ));
    }
    if status == reqwest::StatusCode::NOT_FOUND || status == reqwest::StatusCode::GONE {
        return Ok(false);
    }
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err("credential-unavailable: Gemini rejected the active credential".to_string());
    }
    if !status.is_success() {
        return Err(format!("Gemini file validation was rejected ({status})"));
    }
    let file = tokio::select! {
        result = response.json::<GeminiFileObject>() => {
            result.map_err(|error| format!("Gemini file validation response was invalid: {error}"))?
        }
        _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
    };
    Ok(matches!(file.state.as_deref(), Some("ACTIVE")))
}

pub(crate) async fn ensure_file_uploaded_for_credential(
    runtime: &BrainRuntimeState,
    credential: &ActiveCredential,
    cas_path: &str,
    cancel_token: &CancellationToken,
) -> Result<EnsuredFile, String> {
    let resolved = super::paths::resolve_attachment_path_internal(cas_path)?;
    let hash = resolved
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| value.len() == 64)
        .ok_or_else(|| "Attachment path does not identify a CAS object".to_string())?
        .to_string();
    let storage = ThreadStorage::new().map_err(|error| error.to_string())?;
    let canonical_path = storage
        .find_object_blob(&hash)
        .map_err(|error| error.to_string())?;
    let remote_id = credential.object_remote_id(&hash).await?;
    let cache_key = remote_id.clone();
    let display_name = canonical_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("attachment")
        .to_string();

    let object_lock = runtime.object_manifest_lock(&hash).await;
    let _guard = tokio::select! {
        guard = object_lock.lock() => guard,
        _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
    };
    let lock_hash = hash.clone();
    let _cross_process_guard = tokio::select! {
        result = tokio::task::spawn_blocking(move || {
            ThreadStorage::new()
                .and_then(|storage| storage.lock_object_manifest(&lock_hash))
                .map_err(|error| error.to_string())
        }) => result
            .map_err(|error| format!("Object manifest lock task failed: {error}"))??,
        _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
    };
    let mut manifest = storage
        .load_object_manifest(&hash)
        .map_err(|error| error.to_string())?;
    let now = Utc::now();
    let before_prune = manifest.object_remotes.len();
    manifest
        .object_remotes
        .retain(|_, remote| remote.expires_at > now);
    if manifest.object_remotes.len() != before_prune {
        storage
            .save_object_manifest(&hash, &manifest)
            .map_err(|error| error.to_string())?;
    }
    if let Some(remote) = manifest.object_remotes.get_mut(&remote_id) {
        if Utc::now() < remote.expires_at
            && validate_remote(credential.api_key(), &remote.file_name, cancel_token).await?
        {
            remote.validated_at = Utc::now();
            let cached = runtime
                .provider_file_cache
                .lock()
                .await
                .get(&cache_key)
                .cloned();
            let file_ref = cached
                .filter(|cached| {
                    cached.file_uri == remote.file_uri
                        && cached.file_name == remote.file_name
                        && cached.mime_type == remote.mime_type
                })
                .unwrap_or_else(|| file_ref_from_remote(remote, display_name));
            storage
                .save_object_manifest(&hash, &manifest)
                .map_err(|error| error.to_string())?;
            runtime
                .provider_file_cache
                .lock()
                .await
                .insert(cache_key, file_ref.clone());
            return Ok(EnsuredFile {
                file_ref,
                disposition: RemoteDisposition::Reused,
            });
        }
    }

    let extension = canonical_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let mime_type = mime_from_extension(extension);
    let upload_name = if extension.is_empty() {
        hash.clone()
    } else {
        format!("{hash}.{extension}")
    };
    let uploaded = super::upload::upload_file_to_gemini_cancellable(
        credential.api_key(),
        &canonical_path.to_string_lossy(),
        mime_type,
        &upload_name,
        cancel_token,
    )
    .await?;
    manifest.object_remotes.insert(
        remote_id,
        ObjectRemote {
            file_uri: uploaded.file_uri.clone(),
            file_name: uploaded.file_name.clone(),
            mime_type: uploaded.mime_type.clone(),
            uploaded_at: uploaded.uploaded_at,
            expires_at: uploaded.expires_at,
            validated_at: Utc::now(),
        },
    );
    storage
        .save_object_manifest(&hash, &manifest)
        .map_err(|error| error.to_string())?;
    runtime
        .provider_file_cache
        .lock()
        .await
        .insert(cache_key, uploaded.clone());
    Ok(EnsuredFile {
        file_ref: uploaded,
        disposition: RemoteDisposition::Uploaded,
    })
}

pub async fn ensure_file_uploaded(
    runtime: &BrainRuntimeState,
    api_key: &str,
    cas_path: &str,
    cancel_token: Option<&CancellationToken>,
) -> Result<GeminiFileRef, String> {
    let credential = active_credential(api_key).await?;
    let fallback_cancel = CancellationToken::new();
    Ok(ensure_file_uploaded_for_credential(
        runtime,
        &credential,
        cas_path,
        cancel_token.unwrap_or(&fallback_cancel),
    )
    .await?
    .file_ref)
}
