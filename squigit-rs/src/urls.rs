// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Canonical public URLs shared by Squigit shells.

use thiserror::Error;

// Public policies served
const LICENSE_URL: &str = "https://github.com/squigit-org/squigit/blob/main/LICENSE";
const TERMS_OF_SERVICE_URL: &str = "https://squigit-org.github.io/legal/terms.html";
const PRIVACY_POLICY_URL: &str = "https://squigit-org.github.io/legal/privacy.html";

// Shared release metadata served to all Squigit shells.
pub(crate) const SQUIGIT_RELEASES_URL: &str =
    "https://raw.githubusercontent.com/squigit-org/distribution/main/releases.json";

#[derive(Debug, Error)]
pub enum UrlError {
    #[error("Unknown Squigit URL identifier: {0}")]
    UnknownIdentifier(String),
}

pub type Result<T> = std::result::Result<T, UrlError>;

pub fn resolve(identifier: &str) -> Result<String> {
    match identifier.trim() {
        "license" => Ok(LICENSE_URL.to_string()),
        "terms" => Ok(TERMS_OF_SERVICE_URL.to_string()),
        "privacy" => Ok(PRIVACY_POLICY_URL.to_string()),
        identifier => Err(UrlError::UnknownIdentifier(identifier.to_string())),
    }
}
