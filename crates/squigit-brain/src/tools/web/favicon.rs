// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use base64::{engine::general_purpose, Engine as _};
use futures_util::future::join_all;
use reqwest::{header, redirect::Policy};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::Duration;
use url::Url;

use super::constants::{
    FAVICON_CONNECT_TIMEOUT_SECS, FAVICON_TIMEOUT_SECS, MAX_FAVICON_BYTES, MAX_REDIRECTS,
};
use super::transport::user_agent;
use super::types::CitationSource;
use super::url_utils::{domain_from_url, is_remote_http_url};

pub(crate) fn favicon_for_url(url: &str) -> Option<String> {
    domain_from_url(url)
        .map(|domain| format!("https://www.google.com/s2/favicons?domain={}&sz=32", domain))
}

fn favicon_mime_from_content_type(content_type: &str) -> Option<&'static str> {
    let normalized = content_type
        .split(';')
        .next()
        .map(str::trim)
        .unwrap_or_default()
        .to_ascii_lowercase();

    match normalized.as_str() {
        "image/png" => Some("image/png"),
        "image/jpeg" => Some("image/jpeg"),
        "image/webp" => Some("image/webp"),
        "image/svg+xml" => Some("image/svg+xml"),
        "image/x-icon" | "image/vnd.microsoft.icon" => Some("image/x-icon"),
        _ => None,
    }
}

fn favicon_mime_from_url(url: &str) -> Option<&'static str> {
    let parsed = Url::parse(url).ok()?;
    let ext = Path::new(parsed.path())
        .extension()
        .and_then(|v| v.to_str())
        .map(str::trim)
        .filter(|v| !v.is_empty())?
        .to_ascii_lowercase();

    if ext.len() > 8 || !ext.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        return None;
    }

    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "ico" => Some("image/x-icon"),
        _ => None,
    }
}

async fn fetch_favicon_base64(
    client: reqwest::Client,
    favicon_url: String,
) -> (String, Option<String>) {
    let response = match client
        .get(&favicon_url)
        .header(header::ACCEPT, "image/*,*/*;q=0.8")
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(_) => return (favicon_url, None),
    };

    if !response.status().is_success() {
        return (favicon_url, None);
    }

    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_string());

    if let Some(kind) = content_type.as_deref() {
        let normalized = kind
            .split(';')
            .next()
            .map(str::trim)
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !normalized.starts_with("image/") && normalized != "application/octet-stream" {
            return (favicon_url, None);
        }
    }

    let bytes = match response.bytes().await {
        Ok(body) => body,
        Err(_) => return (favicon_url, None),
    };

    if bytes.is_empty() || bytes.len() > MAX_FAVICON_BYTES {
        return (favicon_url, None);
    }

    let mime = content_type
        .as_deref()
        .and_then(favicon_mime_from_content_type)
        .or_else(|| favicon_mime_from_url(&favicon_url))
        .unwrap_or("image/png");
    let encoded = general_purpose::STANDARD.encode(bytes.as_ref());

    (favicon_url, Some(format!("data:{};base64,{}", mime, encoded)))
}

pub(crate) async fn hydrate_favicons_for_sources(sources: &mut [CitationSource]) {
    if sources.is_empty() {
        return;
    }

    let favicon_client = match reqwest::Client::builder()
        .redirect(Policy::limited(MAX_REDIRECTS))
        .timeout(Duration::from_secs(FAVICON_TIMEOUT_SECS))
        .connect_timeout(Duration::from_secs(FAVICON_CONNECT_TIMEOUT_SECS))
        .user_agent(user_agent())
        .build()
    {
        Ok(client) => client,
        Err(_) => return,
    };

    let mut unique_urls = Vec::<String>::new();
    let mut seen_urls = HashSet::<String>::new();

    for source in sources.iter() {
        let Some(favicon_url) = source
            .favicon_url
            .as_deref()
            .map(str::trim)
            .filter(|v| is_remote_http_url(v))
        else {
            continue;
        };

        if seen_urls.insert(favicon_url.to_string()) {
            unique_urls.push(favicon_url.to_string());
        }
    }

    if unique_urls.is_empty() {
        return;
    }

    let tasks = unique_urls.into_iter().map(|favicon_url| {
        fetch_favicon_base64(favicon_client.clone(), favicon_url)
    });
    let hydrated_favicons = join_all(tasks).await.into_iter().collect::<HashMap<_, _>>();

    for source in sources.iter_mut() {
        let Some(favicon_url) = source
            .favicon_url
            .as_deref()
            .map(str::trim)
            .filter(|v| is_remote_http_url(v))
        else {
            continue;
        };

        if let Some(Some(favicon_base64)) = hydrated_favicons.get(favicon_url) {
            source.favicon_base64 = Some(favicon_base64.clone());
        }
    }
}

pub(crate) fn citation_source(title: String, url: String, summary: String) -> CitationSource {
    let favicon = favicon_for_url(&url);
    CitationSource {
        title,
        url,
        summary,
        favicon_url: favicon,
        favicon_base64: None,
    }
}
