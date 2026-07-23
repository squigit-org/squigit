// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::Utc;
use squigit_auth::security::ApiKeyProvider;
use squigit_storage::{ObjectRemote, ProfileStore, ThreadStorage};
use std::collections::HashMap;
use tokio::sync::Mutex;

use super::types::GeminiFileObject;
use super::{mime_from_extension, upload_file_to_gemini, GeminiFileRef};

pub(crate) struct ActiveKeyIdentity {
    pub(crate) stable_sha: String,
    pub(crate) ciphertext: String,
}

pub(crate) fn active_key_identity(api_key: &str) -> Result<ActiveKeyIdentity, String> {
    let store = ProfileStore::new().map_err(|error| error.to_string())?;
    let profile_id = store
        .get_active_profile_id()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "No active profile is available for attachment uploads".to_string())?;
    let payload = store
        .load_encrypted_key_payload(
            &profile_id,
            ApiKeyProvider::GoogleAiStudio.storage_key_name(),
        )
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "The active profile has no Google AI Studio key".to_string())?;
    let stable_sha = payload
        .get("sha256")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "The active Google key payload has no stable SHA identity".to_string())?
        .to_string();
    let ciphertext = payload
        .get("ciphertext")
        .and_then(|value| value.as_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "The active Google key payload has no ciphertext reference".to_string())?
        .to_string();

    let decrypted = squigit_auth::security::get_decrypted_key(
        &store,
        ApiKeyProvider::GoogleAiStudio,
        &profile_id,
    )
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "The active Google key could not be loaded".to_string())?;
    if decrypted.trim() != api_key.trim() {
        return Err("The request key does not match the active profile key".to_string());
    }

    Ok(ActiveKeyIdentity {
        stable_sha,
        ciphertext,
    })
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

async fn validate_remote(api_key: &str, file_name: &str) -> Result<bool, String> {
    if file_name.trim().is_empty() {
        return Ok(false);
    }
    let response = reqwest::Client::new()
        .get(format!(
            "https://generativelanguage.googleapis.com/v1beta/{file_name}?key={api_key}"
        ))
        .send()
        .await
        .map_err(|error| format!("Gemini file validation failed: {error}"))?;
    if !response.status().is_success() {
        return Ok(false);
    }
    let file = response
        .json::<GeminiFileObject>()
        .await
        .map_err(|error| format!("Gemini file validation response was invalid: {error}"))?;
    Ok(file.state.as_deref().unwrap_or("ACTIVE") == "ACTIVE")
}

pub async fn ensure_file_uploaded(
    api_key: &str,
    cas_path: &str,
    cache: &Mutex<HashMap<String, GeminiFileRef>>,
) -> Result<GeminiFileRef, String> {
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
    let identity = active_key_identity(api_key)?;
    let cache_key = format!("{hash}:{}", identity.stable_sha);
    let display_name = canonical_path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("attachment")
        .to_string();

    let mut manifest = storage
        .load_object_manifest(&hash)
        .map_err(|error| error.to_string())?;
    if let Some(remote) = manifest.object_remotes.get_mut(&identity.stable_sha) {
        if Utc::now() < remote.expires_at && validate_remote(api_key, &remote.file_name).await? {
            remote.encrypted_key_ref = identity.ciphertext.clone();
            remote.validated_at = Utc::now();
            let cached = cache.lock().await.get(&cache_key).cloned();
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
            cache.lock().await.insert(cache_key, file_ref.clone());
            return Ok(file_ref);
        }
    }

    let extension = canonical_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let mime_type = mime_from_extension(extension);
    let upload_name = format!("{}.{}", hash.chars().take(8).collect::<String>(), extension);
    let uploaded = upload_file_to_gemini(
        api_key,
        &canonical_path.to_string_lossy(),
        mime_type,
        &upload_name,
    )
    .await?;
    manifest.object_remotes.insert(
        identity.stable_sha,
        ObjectRemote {
            encrypted_key_ref: identity.ciphertext,
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
    cache.lock().await.insert(cache_key, uploaded.clone());
    Ok(uploaded)
}
