// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::Utc;
use squigit_auth::security::{get_decrypted_api_key, ApiKeyProvider};
use squigit_storage::{ObjectRemote, ProfileStore, ThreadStorage};
use tokio_util::sync::CancellationToken;

use crate::runtime::BrainRuntimeState;

use super::types::GeminiFileObject;
use super::{mime_from_extension, GeminiFileRef};

#[derive(Debug, Clone)]
pub(crate) struct ActiveKeyIdentity {
    pub(crate) api_key: String,
    pub(crate) fingerprint: String,
    pub(crate) encrypted_key_ref: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum RemoteDisposition {
    Reused,
    Uploaded,
}

impl RemoteDisposition {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Reused => "remote_reused",
            Self::Uploaded => "remote_uploaded",
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct EnsuredFile {
    pub(crate) file_ref: GeminiFileRef,
    pub(crate) disposition: RemoteDisposition,
}

pub(crate) fn load_active_key_identity() -> Result<ActiveKeyIdentity, String> {
    let store = ProfileStore::new().map_err(|error| error.to_string())?;
    let profile_id = store
        .get_active_profile_id()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No active profile is available for attachment uploads".to_string())?;
    let credential = get_decrypted_api_key(&store, ApiKeyProvider::GoogleAiStudio, &profile_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "The active profile has no Google AI Studio key".to_string())?;

    Ok(ActiveKeyIdentity {
        api_key: credential.api_key,
        fingerprint: credential.key_fingerprint,
        encrypted_key_ref: credential.encrypted_key_ref,
    })
}

pub(crate) fn active_key_identity(api_key: &str) -> Result<ActiveKeyIdentity, String> {
    let identity = load_active_key_identity()?;
    if identity.api_key.trim() != api_key.trim() {
        return Err("The request key does not match the active profile key".to_string());
    }
    Ok(identity)
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
            .get(format!(
                "https://generativelanguage.googleapis.com/v1beta/{file_name}?key={api_key}"
            ))
            .send() => {
                result.map_err(|error| format!("TRANSIENT: Gemini file validation failed: {error}"))?
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
    if !status.is_success() {
        let body = tokio::select! {
            result = response.text() => result.unwrap_or_default(),
            _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
        };
        return Err(format!(
            "Gemini file validation was rejected ({status}): {body}"
        ));
    }
    let file = tokio::select! {
        result = response.json::<GeminiFileObject>() => {
            result.map_err(|error| format!("Gemini file validation response was invalid: {error}"))?
        }
        _ = cancel_token.cancelled() => return Err("CANCELLED".to_string()),
    };
    Ok(matches!(file.state.as_deref(), Some("ACTIVE")))
}

pub(crate) async fn ensure_file_uploaded_for_identity(
    runtime: &BrainRuntimeState,
    identity: &ActiveKeyIdentity,
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
    let cache_key = format!("{hash}:{}", identity.fingerprint);
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
    let mut manifest = storage
        .load_object_manifest(&hash)
        .map_err(|error| error.to_string())?;
    if let Some(remote) = manifest.object_remotes.get_mut(&identity.fingerprint) {
        if Utc::now() < remote.expires_at
            && validate_remote(&identity.api_key, &remote.file_name, cancel_token).await?
        {
            remote.encrypted_key_ref = identity.encrypted_key_ref.clone();
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
        &identity.api_key,
        &canonical_path.to_string_lossy(),
        mime_type,
        &upload_name,
        cancel_token,
    )
    .await?;
    manifest.object_remotes.insert(
        identity.fingerprint.clone(),
        ObjectRemote {
            encrypted_key_ref: identity.encrypted_key_ref.clone(),
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
    let identity = active_key_identity(api_key)?;
    let fallback_cancel = CancellationToken::new();
    Ok(ensure_file_uploaded_for_identity(
        runtime,
        &identity,
        cas_path,
        cancel_token.unwrap_or(&fallback_cancel),
    )
    .await?
    .file_ref)
}
