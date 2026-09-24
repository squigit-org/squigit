// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::types::CitationSource;
use super::url_utils::domain_from_url;

pub(crate) fn citation_source(title: String, url: String, summary: String) -> CitationSource {
    let favicon_url = domain_from_url(&url)
        .map(|domain| format!("https://www.google.com/s2/favicons?domain={domain}&sz=32"));
    CitationSource {
        title,
        url,
        summary,
        favicon_url,
        favicon_base64: None,
    }
}
