// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::BTreeMap;
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

use super::attachments::ActiveCredential;

pub const BOOTSTRAP_LITE_MODEL: &str = "models/gemini-flash-lite-latest";
pub const PRIMARY_FAST_MODEL: &str = "models/gemini-flash-latest";
pub const PRIMARY_REASONING_MODEL: &str = "models/gemini-pro-latest";
pub const DEFAULT_MODEL_EFFORT: &str = "medium";
pub const MODEL_EFFORTS: &[&str] = &["low", "medium", "high"];

const CATALOG_TTL: Duration = Duration::from_secs(15 * 60);

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableModel {
    pub id: String,
    pub name: String,
    pub provider: String,
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
enum ModelFamily {
    FlashLite,
    Flash,
    Pro,
}

impl ModelFamily {
    fn label(self) -> &'static str {
        match self {
            Self::FlashLite => "Flash-Lite",
            Self::Flash => "Flash",
            Self::Pro => "Pro",
        }
    }
}

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
struct ModelVersion(Vec<u32>);

#[derive(Clone, Debug)]
enum Release {
    Stable(u32),
    Preview(Option<(u32, u32, u32)>),
}

impl Release {
    fn rank(&self) -> (u8, u32, u32, u32) {
        match self {
            Self::Stable(patch) => (3, *patch, 0, 0),
            Self::Preview(None) => (2, 0, 0, 0),
            Self::Preview(Some((year, month, day))) => (1, *year, *month, *day),
        }
    }

    fn is_stable(&self) -> bool {
        matches!(self, Self::Stable(_))
    }
}

#[derive(Clone, Debug)]
struct ModelRoute {
    id: String,
    version: ModelVersion,
    family: ModelFamily,
    release: Release,
}

impl ModelRoute {
    fn label(&self) -> String {
        let version = self
            .version
            .0
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(".");
        format!("Gemini {version} {}", self.family.label())
    }
}

struct CachedCatalog {
    credential: ActiveCredential,
    fetched_at: Instant,
    routes: Vec<ModelRoute>,
}

static CATALOG: OnceLock<Mutex<Option<CachedCatalog>>> = OnceLock::new();

fn catalog_cache() -> &'static Mutex<Option<CachedCatalog>> {
    CATALOG.get_or_init(|| Mutex::new(None))
}

fn parse_preview_date(parts: &[&str]) -> Option<(u32, u32, u32)> {
    if !(2..=3).contains(&parts.len()) {
        return None;
    }
    let numbers = parts
        .iter()
        .map(|part| part.parse::<u32>().ok())
        .collect::<Option<Vec<_>>>()?;
    let (year, month, day) = if parts[0].len() == 4 {
        (numbers[0], numbers[1], *numbers.get(2).unwrap_or(&0))
    } else if parts[1].len() == 4 {
        (numbers[1], numbers[0], *numbers.get(2).unwrap_or(&0))
    } else {
        return None;
    };
    ((1..=12).contains(&month) && day <= 31).then_some((year, month, day))
}

fn parse_route(id: &str) -> Option<ModelRoute> {
    let rest = id.strip_prefix("models/gemini-")?;
    let mut parts = rest.split('-');
    let version = parts
        .next()?
        .split('.')
        .map(|part| {
            (!part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit()))
                .then(|| part.parse::<u32>().ok())
                .flatten()
        })
        .collect::<Option<Vec<_>>>()?;
    let family = match parts.next()? {
        "pro" => ModelFamily::Pro,
        "flash" => ModelFamily::Flash,
        _ => return None,
    };
    let mut suffix = parts.collect::<Vec<_>>();
    let family = if family == ModelFamily::Flash && suffix.first() == Some(&"lite") {
        suffix.remove(0);
        ModelFamily::FlashLite
    } else {
        family
    };
    let release = match suffix.as_slice() {
        [] => Release::Stable(0),
        ["preview"] => Release::Preview(None),
        ["preview", date @ ..] => Release::Preview(Some(parse_preview_date(date)?)),
        [patch] if !patch.is_empty() && patch.bytes().all(|byte| byte.is_ascii_digit()) => {
            Release::Stable(patch.parse().ok()?)
        }
        _ => return None,
    };
    Some(ModelRoute {
        id: id.to_string(),
        version: ModelVersion(version),
        family,
        release,
    })
}

fn alias_family(id: &str) -> Option<ModelFamily> {
    match id {
        PRIMARY_FAST_MODEL => Some(ModelFamily::Flash),
        PRIMARY_REASONING_MODEL => Some(ModelFamily::Pro),
        BOOTSTRAP_LITE_MODEL => Some(ModelFamily::FlashLite),
        _ => None,
    }
}

async fn fetch_catalog(credential: &ActiveCredential) -> Result<Vec<ModelRoute>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|error| error.to_string())?;
    let mut routes = Vec::new();
    let mut page_token = String::new();
    loop {
        let mut query = vec![("pageSize", "1000")];
        if !page_token.is_empty() {
            query.push(("pageToken", page_token.as_str()));
        }
        let response = client
            .get("https://generativelanguage.googleapis.com/v1beta/models")
            .header("x-goog-api-key", credential.api_key())
            .query(&query)
            .send()
            .await
            .map_err(|error| format!("Could not list Gemini models: {error}"))?;
        if !response.status().is_success() {
            return Err(format!(
                "Gemini model listing failed ({})",
                response.status()
            ));
        }
        let body: serde_json::Value = response
            .json()
            .await
            .map_err(|error| format!("Gemini model listing was invalid: {error}"))?;
        routes.extend(
            body.get("models")
                .and_then(serde_json::Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|item| {
                    let supported = item
                        .get("supportedGenerationMethods")
                        .and_then(serde_json::Value::as_array)?;
                    if !supported
                        .iter()
                        .any(|method| method.as_str() == Some("generateContent"))
                    {
                        return None;
                    }
                    parse_route(item.get("name")?.as_str()?)
                }),
        );
        let Some(next) = body
            .get("nextPageToken")
            .and_then(serde_json::Value::as_str)
            .filter(|token| !token.is_empty())
        else {
            break;
        };
        if next == page_token {
            return Err("Gemini model listing repeated a page token".to_string());
        }
        page_token = next.to_string();
    }
    if routes.is_empty() {
        return Err("Gemini returned no usable chat models".to_string());
    }
    Ok(routes)
}

async fn load_catalog() -> Result<Vec<ModelRoute>, String> {
    let credential = super::attachments::load_active_credential().await?;
    let mut cached = catalog_cache().lock().await;
    if let Some(entry) = cached.as_ref() {
        if entry.credential.matches(&credential) && entry.fetched_at.elapsed() < CATALOG_TTL {
            return Ok(entry.routes.clone());
        }
    }
    let routes = fetch_catalog(&credential).await?;
    *cached = Some(CachedCatalog {
        credential,
        fetched_at: Instant::now(),
        routes: routes.clone(),
    });
    Ok(routes)
}

pub(crate) async fn invalidate_model_catalog() {
    *catalog_cache().lock().await = None;
}

fn preferred_routes(routes: Vec<ModelRoute>) -> Vec<ModelRoute> {
    let mut by_identity = BTreeMap::<(ModelVersion, ModelFamily), ModelRoute>::new();
    for route in routes {
        let key = (route.version.clone(), route.family);
        match by_identity.get(&key) {
            Some(current) if current.release.rank() >= route.release.rank() => {}
            _ => {
                by_identity.insert(key, route);
            }
        }
    }
    let mut result = by_identity.into_values().collect::<Vec<_>>();
    result.sort_by(|a, b| {
        b.version
            .cmp(&a.version)
            .then_with(|| b.family.cmp(&a.family))
    });
    result
}

pub async fn list_available_models() -> Result<Vec<AvailableModel>, String> {
    let models = preferred_routes(load_catalog().await?)
        .into_iter()
        .filter(|route| route.family != ModelFamily::FlashLite)
        .map(|route| AvailableModel {
            id: route.id.clone(),
            name: route.label(),
            provider: "gemini".to_string(),
        })
        .collect::<Vec<_>>();
    if models.is_empty() {
        return Err("Gemini returned no usable Flash/Pro models".to_string());
    }
    Ok(models)
}

pub fn valid_model_id(model_id: &str) -> bool {
    alias_family(model_id).is_some()
        || parse_route(model_id).is_some_and(|route| route.family != ModelFamily::FlashLite)
}

pub fn canonical_model_label(model_id: &str) -> Option<String> {
    match model_id {
        PRIMARY_FAST_MODEL => Some("Auto · Gemini Flash".to_string()),
        PRIMARY_REASONING_MODEL => Some("Auto · Gemini Pro".to_string()),
        _ => parse_route(model_id)
            .filter(|route| route.family != ModelFamily::FlashLite)
            .map(|route| route.label()),
    }
}

pub(crate) async fn build_attempt_plan(
    model_id: &str,
    effort: &str,
) -> Result<Vec<String>, String> {
    if !valid_model_id(model_id) {
        return Err("invalid-model-selection: unsupported model ID".to_string());
    }
    if !MODEL_EFFORTS.contains(&effort) {
        return Err("invalid-model-selection: unsupported effort".to_string());
    }

    let auto = alias_family(model_id);
    let selected = parse_route(model_id);
    let family = auto
        .or_else(|| selected.as_ref().map(|route| route.family))
        .unwrap();
    let mut plan = vec![model_id.to_string()];
    if let Ok(routes) = load_catalog().await {
        let routes = preferred_routes(routes);
        let tiers = match family {
            ModelFamily::Pro => &[ModelFamily::Pro, ModelFamily::Flash, ModelFamily::FlashLite][..],
            ModelFamily::Flash => &[ModelFamily::Flash, ModelFamily::FlashLite][..],
            ModelFamily::FlashLite => &[ModelFamily::FlashLite][..],
        };
        for tier in tiers {
            for route in routes.iter().filter(|route| route.family == *tier) {
                if let Some(selected) = &selected {
                    if route.version > selected.version || !route.release.is_stable() {
                        continue;
                    }
                }
                if !plan.contains(&route.id) {
                    plan.push(route.id.clone());
                }
            }
        }
    }
    if auto.is_some()
        && family != ModelFamily::FlashLite
        && !plan.iter().any(|id| id == BOOTSTRAP_LITE_MODEL)
    {
        plan.push(BOOTSTRAP_LITE_MODEL.to_string());
    }
    Ok(plan)
}
