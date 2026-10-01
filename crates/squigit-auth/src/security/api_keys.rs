// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::str::FromStr;

use crate::{ProfileError, Result};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiKeyProvider {
    OpenRouter,
    ImgBb,
}

impl ApiKeyProvider {
    pub fn display_name(self) -> &'static str {
        match self {
            Self::OpenRouter => "OpenRouter",
            Self::ImgBb => "ImgBB",
        }
    }

    pub fn storage_key_name(self) -> &'static str {
        match self {
            Self::OpenRouter => "openrouter",
            Self::ImgBb => "imgbb",
        }
    }

    pub fn is_valid_key(self, key: &str) -> bool {
        match self {
            Self::OpenRouter => key.strip_prefix("sk-or-v1-").is_some_and(|suffix| {
                !suffix.is_empty()
                    && suffix
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
            }),
            Self::ImgBb => key.len() == 32,
        }
    }

    pub fn validation_hint(self) -> &'static str {
        match self {
            Self::OpenRouter => "Expected an OpenRouter key starting with sk-or-v1-.",
            Self::ImgBb => "Expected a 32-character API key.",
        }
    }
}

impl FromStr for ApiKeyProvider {
    type Err = ProfileError;

    fn from_str(value: &str) -> Result<Self> {
        match value {
            "openrouter" => Ok(Self::OpenRouter),
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
