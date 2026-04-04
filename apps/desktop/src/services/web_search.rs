// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use futures_util::StreamExt;
use rand::Rng;
use regex::Regex;
use reqwest::{header, redirect::Policy, StatusCode};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::net::{IpAddr, Ipv6Addr};
use std::time::Duration;
use tokio::time::sleep;
use url::Url;

const DDG_SEARCH_URL: &str = "https://html.duckduckgo.com/html/?q=";
const DEFAULT_MAX_RESULTS: usize = 6;
const MAX_REDIRECTS: usize = 5;
const MAX_FETCH_BYTES: usize = 320 * 1024;
const MAX_FETCH_CHARS: usize = 12_000;
const MAX_SUMMARY_WORDS: usize = 50;
const MAX_RETRIES: usize = 2;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CitationSource {
    pub title: String,
    pub url: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WebSearchResult {
    pub mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_url: Option<String>,
    pub context_markdown: String,
    pub sources: Vec<CitationSource>,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug)]
struct SearchError {
    message: String,
    retriable: bool,
}

impl SearchError {
    fn fatal(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            retriable: false,
        }
    }

    fn retriable(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            retriable: true,
        }
    }
}

lazy_static::lazy_static! {
    static ref RESULT_LINK_RE: Regex = Regex::new(
        r#"(?is)<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>"#
    ).expect("valid result link regex");
    static ref RESULT_SNIPPET_RE: Regex = Regex::new(
        r#"(?is)<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</(?:a|div)>"#
    ).expect("valid result snippet regex");
    static ref TITLE_RE: Regex = Regex::new(r#"(?is)<title[^>]*>(.*?)</title>"#).expect("valid title regex");
    static ref SKIP_BLOCK_RE: Regex = Regex::new(
        r#"(?is)<script[^>]*>.*?</script>|<style[^>]*>.*?</style>|<head[^>]*>.*?</head>|<noscript[^>]*>.*?</noscript>|<svg[^>]*>.*?</svg>|<math[^>]*>.*?</math>|<nav[^>]*>.*?</nav>|<footer[^>]*>.*?</footer>"#
    ).expect("valid skip block regex");
    static ref TAG_RE: Regex = Regex::new(r#"(?is)<[^>]+>"#).expect("valid tag regex");
    static ref WS_RE: Regex = Regex::new(r#"\s+"#).expect("valid whitespace regex");
}

fn user_agent() -> &'static str {
    // Desktop UA to reduce anti-bot friction on public HTML endpoints.
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
}

fn build_client() -> Result<reqwest::Client, SearchError> {
    reqwest::Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(15))
        .user_agent(user_agent())
        .build()
        .map_err(|e| SearchError::fatal(format!("HTTP client init failed: {}", e)))
}

fn encode_query(query: &str) -> String {
    url::form_urlencoded::byte_serialize(query.as_bytes()).collect::<String>()
}

fn looks_like_loopback_host(host: &str) -> bool {
    let h = host.trim().to_ascii_lowercase();
    h == "localhost" || h.ends_with(".localhost") || h.ends_with(".local")
}

fn is_documentation_v6(v6: &Ipv6Addr) -> bool {
    // 2001:db8::/32 is reserved for documentation/examples.
    let segments = v6.segments();
    segments[0] == 0x2001 && segments[1] == 0x0db8
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            !v4.is_private()
                && !v4.is_loopback()
                && !v4.is_link_local()
                && !v4.is_multicast()
                && !v4.is_broadcast()
                && !v4.is_documentation()
                && !v4.is_unspecified()
        }
        IpAddr::V6(v6) => {
            !v6.is_loopback()
                && !v6.is_unspecified()
                && !v6.is_multicast()
                && !v6.is_unique_local()
                && !v6.is_unicast_link_local()
                && !is_documentation_v6(&v6)
        }
    }
}

async fn ensure_public_target(url: &Url) -> Result<(), SearchError> {
    let host = url
        .host_str()
        .ok_or_else(|| SearchError::fatal("Blocked URL: missing host"))?;
    if looks_like_loopback_host(host) {
        return Err(SearchError::fatal("Blocked URL: local host is not allowed"));
    }

    let port = url
        .port_or_known_default()
        .ok_or_else(|| SearchError::fatal("Blocked URL: unknown port"))?;
    let lookup = tokio::net::lookup_host((host, port))
        .await
        .map_err(|e| SearchError::retriable(format!("DNS lookup failed: {}", e)))?;

    let mut has_ip = false;
    for socket_addr in lookup {
        has_ip = true;
        if !is_public_ip(socket_addr.ip()) {
            return Err(SearchError::fatal(format!(
                "Blocked URL: non-public IP target ({})",
                socket_addr.ip()
            )));
        }
    }
    if !has_ip {
        return Err(SearchError::retriable(
            "DNS lookup returned no IP addresses".to_string(),
        ));
    }
    Ok(())
}

fn clean_html_fragment(input: &str) -> String {
    let mut s = input.replace("&nbsp;", " ");
    s = s.replace("&amp;", "&");
    s = s.replace("&quot;", "\"");
    s = s.replace("&#39;", "'");
    s = s.replace("&lt;", "<");
    s = s.replace("&gt;", ">");

    let without_tags = TAG_RE.replace_all(&s, " ");
    let collapsed = WS_RE.replace_all(&without_tags, " ");
    collapsed.trim().to_string()
}

fn looks_like_ddg_challenge_page(html: &str) -> bool {
    let lower = html.to_ascii_lowercase();
    lower.contains("anomaly-modal")
        || lower.contains("id=\"challenge-form\"")
        || lower.contains("unfortunately, bots use duckduckgo too")
}

fn clean_page_text(raw_html: &str) -> String {
    let stripped = SKIP_BLOCK_RE.replace_all(raw_html, " ");
    let no_tags = TAG_RE.replace_all(&stripped, " ");
    let decoded = clean_html_fragment(&no_tags);
    if decoded.len() > MAX_FETCH_CHARS {
        let mut truncated = decoded[..MAX_FETCH_CHARS].to_string();
        truncated.push_str(" ...");
        return truncated;
    }
    decoded
}

fn compact_summary(text: &str, max_words: usize) -> String {
    if text.trim().is_empty() {
        return String::new();
    }
    let words: Vec<&str> = text.split_whitespace().take(max_words + 1).collect();
    if words.len() <= max_words {
        words.join(" ")
    } else {
        format!("{}...", words[..max_words].join(" "))
    }
}

fn extract_title(raw_html: &str, fallback_url: &str) -> String {
    if let Some(cap) = TITLE_RE.captures(raw_html) {
        if let Some(m) = cap.get(1) {
            let title = clean_html_fragment(m.as_str());
            if !title.is_empty() {
                return title;
            }
        }
    }
    Url::parse(fallback_url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .unwrap_or_else(|| fallback_url.to_string())
}

fn canonicalize_url(raw: &str) -> Result<String, SearchError> {
    let mut input = raw.trim().to_string();
    if input.is_empty() {
        return Err(SearchError::fatal("Invalid URL: empty"));
    }

    if input.starts_with("//") {
        input = format!("https:{}", input);
    }
    if input.starts_with("/l/?") {
        input = format!("https://duckduckgo.com{}", input);
    }

    let mut parsed = Url::parse(&input)
        .map_err(|_| SearchError::fatal(format!("Invalid URL: {}", raw.trim())))?;

    if parsed.host_str() == Some("duckduckgo.com") && parsed.path().starts_with("/l/") {
        let mut uddg_value = None;
        for (k, v) in parsed.query_pairs() {
            if k == "uddg" {
                uddg_value = Some(v.to_string());
                break;
            }
        }
        if let Some(decoded) = uddg_value {
            parsed = Url::parse(&decoded)
                .map_err(|_| SearchError::fatal(format!("Invalid redirect URL: {}", decoded)))?;
        }
    }

    let scheme = parsed.scheme().to_ascii_lowercase();
    if scheme != "http" && scheme != "https" {
        return Err(SearchError::fatal(format!(
            "Blocked URL scheme: {}",
            parsed.scheme()
        )));
    }
    if parsed.host_str().is_none() {
        return Err(SearchError::fatal("Blocked URL: host is required"));
    }

    parsed.set_fragment(None);
    if (parsed.scheme() == "https" && parsed.port() == Some(443))
        || (parsed.scheme() == "http" && parsed.port() == Some(80))
    {
        let _ = parsed.set_port(None);
    }

    Ok(parsed.to_string())
}

async fn read_capped_response_body(
    response: reqwest::Response,
    max_bytes: usize,
) -> Result<String, SearchError> {
    let mut stream = response.bytes_stream();
    let mut total = 0usize;
    let mut bytes = Vec::<u8>::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk
            .map_err(|e| SearchError::retriable(format!("Read body failed: {}", e)))?;
        total += chunk.len();
        if total > max_bytes {
            let allowed = chunk.len().saturating_sub(total - max_bytes);
            bytes.extend_from_slice(&chunk[..allowed]);
            break;
        }
        bytes.extend_from_slice(&chunk);
    }

    Ok(String::from_utf8_lossy(&bytes).to_string())
}

async fn fetch_html_with_redirects(url: &str) -> Result<String, SearchError> {
    let client = build_client()?;
    let mut current =
        Url::parse(url).map_err(|_| SearchError::fatal(format!("Invalid URL: {}", url)))?;

    for hop in 0..=MAX_REDIRECTS {
        ensure_public_target(&current).await?;

        let response = client
            .get(current.clone())
            .header(header::ACCEPT, "text/html,application/xhtml+xml")
            .send()
            .await
            .map_err(|e| SearchError::retriable(format!("Fetch failed: {}", e)))?;

        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| SearchError::fatal("Redirect missing Location header"))?;
            let next = current
                .join(location)
                .map_err(|e| SearchError::fatal(format!("Bad redirect URL: {}", e)))?;
            current = next;
            if hop == MAX_REDIRECTS {
                return Err(SearchError::fatal("Too many redirects"));
            }
            continue;
        }

        if !response.status().is_success() {
            let status = response.status();
            if status == StatusCode::TOO_MANY_REQUESTS
                || status == StatusCode::BAD_GATEWAY
                || status == StatusCode::SERVICE_UNAVAILABLE
                || status == StatusCode::GATEWAY_TIMEOUT
                || status.is_server_error()
            {
                return Err(SearchError::retriable(format!(
                    "HTTP {} while fetching URL",
                    status.as_u16()
                )));
            }
            return Err(SearchError::fatal(format!(
                "HTTP {} while fetching URL",
                status.as_u16()
            )));
        }

        return read_capped_response_body(response, MAX_FETCH_BYTES).await;
    }

    Err(SearchError::fatal("Too many redirects"))
}

async fn run_query_once(query: &str, max_results: usize) -> Result<WebSearchResult, SearchError> {
    let client = build_client()?;
    let encoded = encode_query(query);
    let search_url = format!("{}{}", DDG_SEARCH_URL, encoded);

    let response = client
        .get(search_url)
        .header(header::ACCEPT, "text/html")
        .send()
        .await
        .map_err(|e| SearchError::retriable(format!("Search failed: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        if status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
            return Err(SearchError::retriable(format!(
                "DuckDuckGo returned HTTP {}",
                status.as_u16()
            )));
        }
        return Err(SearchError::fatal(format!(
            "Search failed with HTTP {}",
            status.as_u16()
        )));
    }

    let html = read_capped_response_body(response, MAX_FETCH_BYTES).await?;
    if looks_like_ddg_challenge_page(&html) {
        return Err(SearchError::retriable(
            "DuckDuckGo temporarily blocked automated requests (challenge page)".to_string(),
        ));
    }
    let mut sources = Vec::<CitationSource>::new();
    let mut seen = HashSet::<String>::new();

    let link_matches: Vec<_> = RESULT_LINK_RE.find_iter(&html).collect();
    for (idx, m) in link_matches.iter().enumerate() {
        if sources.len() >= max_results {
            break;
        }

        let Some(cap) = RESULT_LINK_RE.captures(m.as_str()) else {
            continue;
        };
        let Some(url_raw) = cap.get(1).map(|v| v.as_str()) else {
            continue;
        };
        let Some(title_raw) = cap.get(2).map(|v| v.as_str()) else {
            continue;
        };

        let canonical = match canonicalize_url(url_raw) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if !seen.insert(canonical.clone()) {
            continue;
        }

        let segment_start = m.end();
        let segment_end = link_matches
            .get(idx + 1)
            .map(|n| n.start())
            .unwrap_or(html.len());
        let segment = &html[segment_start..segment_end.min(html.len())];
        let snippet = RESULT_SNIPPET_RE
            .captures(segment)
            .and_then(|c| c.get(1).or_else(|| c.get(2)))
            .map(|v| clean_html_fragment(v.as_str()))
            .unwrap_or_default();

        let title = clean_html_fragment(title_raw);
        sources.push(CitationSource {
            title: if title.is_empty() {
                Url::parse(&canonical)
                    .ok()
                    .and_then(|u| u.host_str().map(|h| h.to_string()))
                    .unwrap_or_else(|| canonical.clone())
            } else {
                title
            },
            url: canonical,
            summary: compact_summary(&snippet, MAX_SUMMARY_WORDS),
        });
    }

    if sources.is_empty() {
        return Err(SearchError::retriable(
            "No search results returned from DuckDuckGo".to_string(),
        ));
    }

    let mut context = format!("[Search results for \"{}\"]\n", query.trim());
    for source in &sources {
        context.push_str(&format!(
            "- {} — {}\n  {}\n",
            source.title,
            source.url,
            if source.summary.is_empty() {
                "(No snippet available)"
            } else {
                &source.summary
            }
        ));
    }

    Ok(WebSearchResult {
        mode: "query".to_string(),
        query: Some(query.trim().to_string()),
        requested_url: None,
        context_markdown: context.trim().to_string(),
        sources,
        success: true,
        message: None,
    })
}

async fn run_url_fetch_once(url: &str) -> Result<WebSearchResult, SearchError> {
    let canonical = canonicalize_url(url)?;
    let html = fetch_html_with_redirects(&canonical).await?;
    let text = clean_page_text(&html);
    if text.trim().is_empty() {
        return Err(SearchError::retriable(
            "Fetched page returned no readable text".to_string(),
        ));
    }

    let title = extract_title(&html, &canonical);
    let summary = compact_summary(&text, MAX_SUMMARY_WORDS);
    let source = CitationSource {
        title,
        url: canonical.clone(),
        summary: summary.clone(),
    };

    let context = format!(
        "[Fetched page: {}]\n- {}\n\n{}",
        canonical,
        if summary.is_empty() {
            "(No short summary available)"
        } else {
            &summary
        },
        text
    );

    Ok(WebSearchResult {
        mode: "url".to_string(),
        query: None,
        requested_url: Some(canonical),
        context_markdown: context,
        sources: vec![source],
        success: true,
        message: None,
    })
}

async fn with_retries<F, Fut>(mut op: F) -> Result<WebSearchResult, SearchError>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<WebSearchResult, SearchError>>,
{
    let mut attempt = 0usize;
    loop {
        match op().await {
            Ok(v) => return Ok(v),
            Err(e) => {
                if !e.retriable || attempt >= MAX_RETRIES {
                    return Err(e);
                }
                attempt += 1;
                let exp = 2u64.pow(attempt as u32);
                let jitter = rand::thread_rng().gen_range(80..220);
                let wait_ms = exp * 220 + jitter;
                sleep(Duration::from_millis(wait_ms)).await;
            }
        }
    }
}

pub async fn search_query(query: &str, max_results: Option<usize>) -> Result<WebSearchResult, String> {
    let q = query.trim();
    if q.is_empty() {
        return Err("No query provided".to_string());
    }
    let limit = max_results
        .unwrap_or(DEFAULT_MAX_RESULTS)
        .clamp(1, DEFAULT_MAX_RESULTS);

    with_retries(|| run_query_once(q, limit))
        .await
        .map_err(|e| e.message)
}

pub fn collect_allowed_urls(result: &WebSearchResult) -> HashSet<String> {
    result.sources.iter().map(|s| s.url.clone()).collect()
}

pub async fn fetch_url_from_allowed(
    url: &str,
    allowed_urls: &HashSet<String>,
) -> Result<WebSearchResult, String> {
    let canonical = canonicalize_url(url).map_err(|e| e.message)?;
    if !allowed_urls.contains(&canonical) {
        return Err(
            "Blocked URL fetch: URL must come from a previous search result in this turn"
                .to_string(),
        );
    }

    with_retries(|| run_url_fetch_once(&canonical))
        .await
        .map_err(|e| e.message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonicalize_ddg_redirect_url() {
        let input = "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%2Fb%3Fx%3D1";
        let out = canonicalize_url(input).expect("url should parse");
        assert!(out.starts_with("https://example.com/a/b?x=1"));
    }

    #[test]
    fn canonicalize_blocks_non_http() {
        let out = canonicalize_url("file:///etc/passwd");
        assert!(out.is_err());
    }

    #[test]
    fn compact_summary_truncates() {
        let text = "one two three four five six";
        let out = compact_summary(text, 4);
        assert_eq!(out, "one two three four...");
    }
}
