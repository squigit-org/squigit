// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use serde::Deserialize;

use super::url_utils::normalize_domain;

#[derive(Deserialize)]
struct SafeSourcesCatalog {
    safe_sources: Vec<SafeSourcesCategory>,
}

#[derive(Deserialize)]
struct SafeSourcesCategory {
    category: String,
    sites: Vec<SafeSourceSite>,
}

#[derive(Deserialize)]
struct SafeSourceSite {
    domain: String,
}

lazy_static::lazy_static! {
    static ref SAFE_SOURCES: Vec<SafeSourcesCategory> = {
        serde_json::from_str::<SafeSourcesCatalog>(include_str!("../assets/knowledge/safe_sources.json"))
            .expect("safe sources catalog must be valid")
            .safe_sources
    };
}

pub(crate) fn source_preference(domain: &str) -> i32 {
    let normalized = normalize_domain(domain)
        .trim_start_matches("www.")
        .to_string();
    SAFE_SOURCES
        .iter()
        .flat_map(|category| {
            let weight = match category.category.as_str() {
                "official_technology" | "official_security" | "official_science_health" => 12,
                "reported_news" => 8,
                "science_reporting" => 6,
                "community_reference" => 2,
                _ => 0,
            };
            category.sites.iter().map(move |site| (weight, site))
        })
        .filter(|(_, site)| {
            let source = normalize_domain(&site.domain);
            normalized == source || normalized.ends_with(&format!(".{source}"))
        })
        .map(|(weight, _)| weight)
        .max()
        .unwrap_or(0)
}
