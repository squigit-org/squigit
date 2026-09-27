// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Canonical public URLs shared by Squigit shells.

use thiserror::Error;

const WEBSITE_URL: &str = "https://squigit-org.github.io";
const REPOSITORY_URL: &str = "https://github.com/squigit-org/squigit";
const RAW_REPOSITORY_URL: &str = "https://raw.githubusercontent.com/squigit-org/squigit/main";
const SUPPORT_EMAIL_URL: &str = "mailto:support@squigit.com";

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
        "license" => Ok(format!("{REPOSITORY_URL}/blob/main/LICENSE")),
        "terms" => Ok(format!("{WEBSITE_URL}/legal/terms/")),
        "privacy" => Ok(format!("{WEBSITE_URL}/legal/privacy/")),
        "app-download" => Ok(format!("{WEBSITE_URL}/#download")),
        "docs" => Ok(format!("{REPOSITORY_URL}/blob/main/docs/")),
        "byok-policy" => Ok(format!(
            "{REPOSITORY_URL}/blob/main/docs/05-policies/BYOK.md"
        )),
        "security-policy" => Ok(format!(
            "{REPOSITORY_URL}/blob/main/docs/05-policies/SECURITY.md"
        )),
        "repository" => Ok(REPOSITORY_URL.to_string()),
        "feedback-templates" => Ok(format!("{RAW_REPOSITORY_URL}/.github/ISSUE_TEMPLATE")),
        "support-email" => Ok(SUPPORT_EMAIL_URL.to_string()),
        identifier => Err(UrlError::UnknownIdentifier(identifier.to_string())),
    }
}
