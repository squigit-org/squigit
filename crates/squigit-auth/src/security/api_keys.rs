// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::str::FromStr;

use crate::{ProfileError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiKeyProvider {
    GoogleAiStudio,
    ImgBb,
}

impl ApiKeyProvider {
    pub fn display_name(self) -> &'static str {
        match self {
            Self::GoogleAiStudio => "Google AI Studio",
            Self::ImgBb => "ImgBB",
        }
    }

    pub fn storage_key_name(self) -> &'static str {
        match self {
            Self::GoogleAiStudio => "google-ai-studio",
            Self::ImgBb => "imgbb",
        }
    }

    pub fn is_valid_key(self, key: &str) -> bool {
        match self {
            Self::GoogleAiStudio => {
                let is_standard = key.starts_with("AIzaSy") && key.len() == 39;
                let is_prefixed = key.starts_with("AQ.") && key.len() >= 50 && key.len() <= 60;
                is_standard || is_prefixed
            }
            Self::ImgBb => key.len() == 32,
        }
    }

    pub fn validation_hint(self) -> &'static str {
        match self {
            Self::GoogleAiStudio => {
                "Expected a key that starts with 'AIzaSy' (39 chars) or 'AQ.' (50-60 chars)."
            }
            Self::ImgBb => "Expected a 32-character API key.",
        }
    }
}

impl FromStr for ApiKeyProvider {
    type Err = ProfileError;

    fn from_str(value: &str) -> Result<Self> {
        match value {
            "google-ai-studio" => Ok(Self::GoogleAiStudio),
            "imgbb" => Ok(Self::ImgBb),
            other => Err(ProfileError::InvalidProvider(other.to_owned())),
        }
    }
}

pub fn validate_api_key(provider: ApiKeyProvider, plaintext: &str) -> Result<()> {
    let trimmed = plaintext.trim();
    if provider.is_valid_key(trimmed) {
        return Ok(());
    }

    Err(ProfileError::byok(
        crate::ByokErrorCode::InvalidCredential,
        format!(
            "Invalid {} API key format. {}",
            provider.display_name(),
            provider.validation_hint()
        ),
    ))
}
