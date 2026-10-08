// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use squigit_auth::security::{get_decrypted_api_key, ApiKeyProvider, DecryptedApiKey};
use squigit_storage::ProfileStore;
use std::sync::Arc;

#[derive(Clone)]
pub(crate) struct ActiveCredential {
    credential: Arc<DecryptedApiKey>,
    pub(crate) profile_id: String,
}

impl std::fmt::Debug for ActiveCredential {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("ActiveCredential([REDACTED])")
    }
}

impl ActiveCredential {
    pub(crate) fn new(credential: DecryptedApiKey, profile_id: String) -> Self {
        Self {
            credential: Arc::new(credential),
            profile_id,
        }
    }

    pub(crate) fn api_key(&self) -> &str {
        self.credential.api_key.expose()
    }
}

pub(crate) async fn capture_image_thread_credential() -> Result<Option<ActiveCredential>, String> {
    tokio::task::spawn_blocking(|| {
        let store = ProfileStore::new().map_err(|error| error.to_string())?;
        let Some(profile_id) = store
            .get_active_profile_id()
            .map_err(|error| error.to_string())?
        else {
            return Ok(None);
        };
        let Some(credential) =
            get_decrypted_api_key(&store, ApiKeyProvider::OpenRouter, &profile_id)
                .map_err(|error| error.to_string())?
        else {
            return Ok(None);
        };

        Ok(Some(ActiveCredential::new(credential, profile_id)))
    })
    .await
    .map_err(|error| format!("credential lookup task failed: {error}"))?
}

pub(crate) fn load_current() -> Result<ActiveCredential, String> {
    let store = ProfileStore::new().map_err(|error| error.to_string())?;
    let profile_id = store
        .get_active_profile_id()
        .map_err(|error| error.to_string())?
        .ok_or("No active profile")?;
    get_decrypted_api_key(&store, ApiKeyProvider::OpenRouter, &profile_id)
        .map_err(|error| error.to_string())?
        .map(|credential| ActiveCredential::new(credential, profile_id))
        .ok_or_else(|| "The active profile has no OpenRouter key".to_string())
}
