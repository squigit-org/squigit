// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use base64::{engine::general_purpose, Engine as _};
use futures_util::future::join_all;
use reqwest::{header, redirect::Policy};
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

fn push_unique_url(urls: &mut Vec<String>, url: String) {
    if is_remote_http_url(&url) && !urls.iter().any(|existing| existing == &url) {
        urls.push(url);
    }
}

fn favicon_hydration_candidates(source: &CitationSource) -> Vec<String> {
    let mut candidates = Vec::<String>::new();

    if let Some(domain) = domain_from_url(&source.url) {
        push_unique_url(
            &mut candidates,
            format!("https://icons.duckduckgo.com/ip3/{}.ico", domain),
        );
    }

    if let Ok(page_url) = Url::parse(&source.url) {
        if matches!(page_url.scheme(), "http" | "https") {
            let origin = page_url.origin().ascii_serialization();
            push_unique_url(&mut candidates, format!("{}/favicon.ico", origin));
            push_unique_url(&mut candidates, format!("{}/favicon.png", origin));
            push_unique_url(&mut candidates, format!("{}/favicon-32x32.png", origin));
            push_unique_url(&mut candidates, format!("{}/apple-touch-icon.png", origin));
        }
    }

    if let Some(favicon_url) = source
        .favicon_url
        .as_deref()
        .map(str::trim)
        .filter(|value| is_remote_http_url(value))
    {
        push_unique_url(&mut candidates, favicon_url.to_string());
    }

    candidates
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
) -> Option<String> {
    println!("[WebSearch] favicon hydrate start url={}", favicon_url);

    let response = match client
        .get(&favicon_url)
        .header(header::ACCEPT, "image/*,*/*;q=0.8")
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(error) => {
            println!(
                "[WebSearch] favicon hydrate failed url={} reason=request_error error={}",
                favicon_url, error
            );
            return None;
        }
    };

    if !response.status().is_success() {
        println!(
            "[WebSearch] favicon hydrate failed url={} reason=http_status status={}",
            favicon_url,
            response.status()
        );
        return None;
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
            println!(
                "[WebSearch] favicon hydrate failed url={} reason=unsupported_content_type content_type={}",
                favicon_url, kind
            );
            return None;
        }
    }

    let bytes = match response.bytes().await {
        Ok(body) => body,
        Err(error) => {
            println!(
                "[WebSearch] favicon hydrate failed url={} reason=read_error error={}",
                favicon_url, error
            );
            return None;
        }
    };

    if bytes.is_empty() || bytes.len() > MAX_FAVICON_BYTES {
        println!(
            "[WebSearch] favicon hydrate failed url={} reason=invalid_size bytes={} max_bytes={}",
            favicon_url,
            bytes.len(),
            MAX_FAVICON_BYTES
        );
        return None;
    }

    let mime = content_type
        .as_deref()
        .and_then(favicon_mime_from_content_type)
        .or_else(|| favicon_mime_from_url(&favicon_url))
        .unwrap_or("image/png");
    let encoded = general_purpose::STANDARD.encode(bytes.as_ref());
    let data_url = format!("data:{};base64,{}", mime, encoded);

    println!(
        "[WebSearch] favicon hydrate success url={} bytes={} mime={} data_url_chars={}",
        favicon_url,
        bytes.len(),
        mime,
        data_url.len()
    );

    Some(data_url)
}

async fn hydrate_source_favicon(
    client: reqwest::Client,
    source_index: usize,
    page_url: String,
    candidates: Vec<String>,
) -> (usize, Option<String>) {
    println!(
        "[WebSearch] favicon hydrate source index={} page_url={} candidates={}",
        source_index,
        page_url,
        candidates.len()
    );

    for (attempt_index, candidate_url) in candidates.into_iter().enumerate() {
        println!(
            "[WebSearch] favicon hydrate attempt index={} attempt={} url={}",
            source_index,
            attempt_index + 1,
            candidate_url
        );

        if let Some(favicon_base64) =
            fetch_favicon_base64(client.clone(), candidate_url.clone()).await
        {
            println!(
                "[WebSearch] favicon hydrate source success index={} attempt={} url={}",
                source_index,
                attempt_index + 1,
                candidate_url
            );
            return (source_index, Some(favicon_base64));
        }
    }

    println!(
        "[WebSearch] favicon hydrate source failed index={} page_url={}",
        source_index, page_url
    );
    (source_index, None)
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
        Err(error) => {
            println!(
                "[WebSearch] favicon hydrate skipped reason=client_error error={}",
                error
            );
            return;
        }
    };

    let jobs = sources
        .iter()
        .enumerate()
        .filter_map(|(index, source)| {
            let candidates = favicon_hydration_candidates(source);
            if candidates.is_empty() {
                return None;
            }

            Some((index, source.url.clone(), candidates))
        })
        .collect::<Vec<_>>();

    if jobs.is_empty() {
        println!("[WebSearch] favicon hydrate skipped reason=no_remote_favicon_urls");
        return;
    }

    println!(
        "[WebSearch] favicon hydrate batch sources={} jobs={}",
        sources.len(),
        jobs.len()
    );

    let tasks = jobs.into_iter().map(|(index, page_url, candidates)| {
        hydrate_source_favicon(favicon_client.clone(), index, page_url, candidates)
    });
    let hydrated_favicons = join_all(tasks).await;

    let mut applied_count = 0usize;
    for (source_index, favicon_base64) in hydrated_favicons {
        if let Some(favicon_base64) = favicon_base64 {
            if let Some(source) = sources.get_mut(source_index) {
                source.favicon_base64 = Some(favicon_base64);
            }
            applied_count += 1;
        }
    }

    println!(
        "[WebSearch] favicon hydrate complete sources={} applied={}",
        sources.len(),
        applied_count
    );
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
