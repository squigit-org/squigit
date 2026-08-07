// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::runtime::BrainRuntimeState;
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use squigit_auth::{ApiKeyProvider, SecretString};
use std::cmp::Ordering;
use std::collections::{BTreeMap, HashSet};
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

pub const BOOTSTRAP_LITE_MODEL: &str = "models/gemini-flash-lite-latest";
pub const PRIMARY_FAST_MODEL: &str = "models/gemini-flash-latest";
pub const PRIMARY_REASONING_MODEL: &str = "models/gemini-pro-latest";

const RETRY_DELAYS: &[Duration] = &[
    Duration::from_secs(2),
    Duration::from_secs(5),
    Duration::from_secs(15),
];
const STEADY_RETRY_DELAY: Duration = Duration::from_secs(60);

lazy_static! {
    static ref STABLE_FLASH_MODEL: Regex =
        Regex::new(r"^models/gemini-(\d+(?:\.\d+)+)-flash(-lite)?(?:-(\d{3}))?$")
            .expect("stable Gemini model regex is valid");
    static ref UNSTABLE_MODEL_MARKER: Regex =
        Regex::new(r"(?:latest|preview|experimental|\bexp\b|image|live|audio|tts)")
            .expect("unstable Gemini model regex is valid");
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoogleModelDescriptor {
    pub name: Option<String>,
    #[serde(default)]
    pub supported_generation_methods: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
pub struct ModelDiscoveryQueues {
    pub flash: Vec<String>,
    pub lite: Vec<String>,
}

#[derive(Clone)]
pub(crate) struct ModelDiscoveryRuntime {
    state: Arc<Mutex<ModelDiscoveryState>>,
    cancellation: Arc<Mutex<Option<CancellationToken>>>,
}

#[derive(Default)]
struct ModelDiscoveryState {
    active_profile_id: Option<String>,
    successful: bool,
    queues: ModelDiscoveryQueues,
}

impl ModelDiscoveryRuntime {
    pub(crate) fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(ModelDiscoveryState::default())),
            cancellation: Arc::new(Mutex::new(None)),
        }
    }
}

#[derive(Clone)]
struct StableModel {
    name: String,
    family: Vec<u32>,
    kind: StableModelKind,
    canonical: bool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum StableModelKind {
    Flash,
    Lite,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelPage {
    #[serde(default)]
    models: Vec<GoogleModelDescriptor>,
    next_page_token: Option<String>,
}

pub(crate) async fn set_active_profile(runtime: &BrainRuntimeState, profile_id: Option<String>) {
    if let Some(previous) = runtime.model_discovery.cancellation.lock().await.take() {
        previous.cancel();
    }

    let profile_id = profile_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    {
        let mut state = runtime.model_discovery.state.lock().await;
        state.active_profile_id = profile_id.clone();
        state.successful = false;
        state.queues = ModelDiscoveryQueues::default();
    }

    let Some(profile_id) = profile_id else {
        return;
    };
    let cancellation = CancellationToken::new();
    *runtime.model_discovery.cancellation.lock().await = Some(cancellation.clone());
    let runtime = runtime.clone();
    tokio::spawn(async move {
        run_handshake(runtime, profile_id, cancellation).await;
    });
}

pub(crate) async fn snapshot(runtime: &BrainRuntimeState) -> ModelDiscoveryQueues {
    let state = runtime.model_discovery.state.lock().await;
    effective_queues(state.successful, &state.queues)
}

pub(crate) async fn build_attempt_plan(
    runtime: &BrainRuntimeState,
    model_id: &str,
    effort: &str,
    task: &str,
) -> Result<Vec<String>, String> {
    let queues = snapshot(runtime).await;
    build_attempt_plan_from_queues(&queues, model_id, effort, task)
}

pub async fn discover_provider_models(
    profile_id: &str,
    provider: &str,
) -> Result<ModelDiscoveryQueues, String> {
    let provider = ApiKeyProvider::from_str(provider).map_err(|error| error.to_string())?;
    if provider != ApiKeyProvider::GoogleAiStudio {
        return Err("invalid-provider: this provider has no model registry".to_string());
    }
    let store = squigit_storage::ProfileStore::new().map_err(|error| error.to_string())?;
    let credential = squigit_auth::get_decrypted_api_key(&store, provider, profile_id)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "credential-unavailable: provider key is not configured".to_string())?;
    discover_with_credential(&credential.api_key).await
}

async fn run_handshake(
    runtime: BrainRuntimeState,
    profile_id: String,
    cancellation: CancellationToken,
) {
    let mut failure_count = 0usize;
    loop {
        if cancellation.is_cancelled() {
            return;
        }
        match discover_provider_models(
            &profile_id,
            ApiKeyProvider::GoogleAiStudio.storage_key_name(),
        )
        .await
        {
            Ok(queues) => {
                let mut state = runtime.model_discovery.state.lock().await;
                if state.active_profile_id.as_deref() == Some(profile_id.as_str())
                    && !cancellation.is_cancelled()
                {
                    state.successful = true;
                    state.queues = queues;
                    log::info!("[Models] Stable Flash queues updated");
                }
                return;
            }
            Err(error) => {
                if cancellation.is_cancelled() {
                    return;
                }
                log::warn!("[Models] Discovery failed; retrying: {error}");
                let delay = RETRY_DELAYS
                    .get(failure_count)
                    .copied()
                    .unwrap_or(STEADY_RETRY_DELAY);
                failure_count += 1;
                tokio::select! {
                    _ = tokio::time::sleep(delay) => {}
                    _ = cancellation.cancelled() => return,
                }
            }
        }
    }
}

async fn discover_with_credential(api_key: &SecretString) -> Result<ModelDiscoveryQueues, String> {
    let client = reqwest::Client::new();
    let mut models = Vec::new();
    let mut page_token: Option<String> = None;
    loop {
        let mut request = client
            .get("https://generativelanguage.googleapis.com/v1beta/models")
            .header("x-goog-api-key", api_key.expose())
            .query(&[("pageSize", "1000")]);
        if let Some(token) = page_token.as_deref() {
            request = request.query(&[("pageToken", token)]);
        }
        let response = request
            .send()
            .await
            .map_err(|_| "transient: Google model discovery failed".to_string())?;
        let status = response.status();
        if !status.is_success() {
            let code = if status == reqwest::StatusCode::UNAUTHORIZED
                || status == reqwest::StatusCode::FORBIDDEN
            {
                "credential-unavailable"
            } else {
                "model-discovery-failed"
            };
            return Err(format!("{code}: Google model discovery failed ({status})"));
        }
        let page = response
            .json::<ModelPage>()
            .await
            .map_err(|_| "model-discovery-failed: invalid Google response".to_string())?;
        models.extend(page.models);
        page_token = page
            .next_page_token
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        if page_token.is_none() {
            break;
        }
    }
    Ok(parse_discovered_models(&models))
}

pub fn parse_discovered_models(models: &[GoogleModelDescriptor]) -> ModelDiscoveryQueues {
    let mut equivalent_families = BTreeMap::<String, StableModel>::new();
    for descriptor in models {
        let Some(candidate) = parse_stable_model(descriptor) else {
            continue;
        };
        let kind = match candidate.kind {
            StableModelKind::Flash => "flash",
            StableModelKind::Lite => "lite",
        };
        let family = candidate
            .family
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(".");
        let family_key = format!("{kind}:{family}");
        let should_replace = equivalent_families
            .get(&family_key)
            .is_none_or(|existing| candidate.canonical && !existing.canonical);
        if should_replace {
            equivalent_families.insert(family_key, candidate);
        }
    }

    let mut stable = equivalent_families.into_values().collect::<Vec<_>>();
    stable.sort_by(|left, right| {
        compare_families(&left.family, &right.family).then_with(|| left.name.cmp(&right.name))
    });
    ModelDiscoveryQueues {
        flash: stable
            .iter()
            .filter(|model| model.kind == StableModelKind::Flash)
            .map(|model| model.name.clone())
            .collect(),
        lite: stable
            .iter()
            .filter(|model| model.kind == StableModelKind::Lite)
            .map(|model| model.name.clone())
            .collect(),
    }
}

fn parse_stable_model(model: &GoogleModelDescriptor) -> Option<StableModel> {
    if !model
        .supported_generation_methods
        .iter()
        .any(|method| method == "generateContent")
    {
        return None;
    }
    let name = model.name.as_deref()?.to_ascii_lowercase();
    if name.is_empty() || UNSTABLE_MODEL_MARKER.is_match(&name) {
        return None;
    }
    let captures = STABLE_FLASH_MODEL.captures(&name)?;
    let family = captures
        .get(1)?
        .as_str()
        .split('.')
        .map(str::parse::<u32>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    let kind = if captures.get(2).is_some() {
        StableModelKind::Lite
    } else {
        StableModelKind::Flash
    };
    let canonical = captures.get(3).is_none();
    Some(StableModel {
        name,
        family,
        kind,
        canonical,
    })
}

fn compare_families(left: &[u32], right: &[u32]) -> Ordering {
    let length = left.len().max(right.len());
    for index in 0..length {
        let order = left
            .get(index)
            .copied()
            .unwrap_or_default()
            .cmp(&right.get(index).copied().unwrap_or_default());
        if order != Ordering::Equal {
            return order;
        }
    }
    Ordering::Equal
}

fn effective_queues(successful: bool, queues: &ModelDiscoveryQueues) -> ModelDiscoveryQueues {
    if !successful {
        return ModelDiscoveryQueues {
            flash: Vec::new(),
            lite: vec![BOOTSTRAP_LITE_MODEL.to_string()],
        };
    }
    ModelDiscoveryQueues {
        flash: queues.flash.clone(),
        lite: if queues.lite.is_empty() {
            vec![BOOTSTRAP_LITE_MODEL.to_string()]
        } else {
            queues.lite.clone()
        },
    }
}

fn build_attempt_plan_from_queues(
    queues: &ModelDiscoveryQueues,
    model_id: &str,
    effort: &str,
    task: &str,
) -> Result<Vec<String>, String> {
    if !matches!(model_id, PRIMARY_FAST_MODEL | PRIMARY_REASONING_MODEL) {
        return Err("invalid-model-selection: unsupported model ID".to_string());
    }
    if !matches!(effort, "low" | "medium" | "high") {
        return Err("invalid-model-selection: unsupported effort".to_string());
    }
    if !matches!(task, "main" | "micro") {
        return Err("invalid-model-selection: unsupported task".to_string());
    }

    let stable_flash = &queues.flash;
    let stable_lite = &queues.lite;
    let is_flash = model_id == PRIMARY_FAST_MODEL;
    let candidates = if task == "micro" {
        if effort == "low" || (is_flash && effort == "medium") {
            stable_lite.clone()
        } else if is_flash {
            prepend(&[BOOTSTRAP_LITE_MODEL], stable_lite)
        } else {
            prepend(&[PRIMARY_FAST_MODEL, BOOTSTRAP_LITE_MODEL], stable_lite)
        }
    } else if is_flash {
        match effort {
            "low" => stable_lite.clone(),
            "medium" => {
                let flash_without_oldest = stable_flash.get(1..).unwrap_or_default();
                join(flash_without_oldest, stable_lite)
            }
            _ => prepend(&[PRIMARY_FAST_MODEL, BOOTSTRAP_LITE_MODEL], stable_lite),
        }
    } else {
        match effort {
            "low" => join(stable_flash, stable_lite),
            "medium" => prepend(&[PRIMARY_REASONING_MODEL, PRIMARY_FAST_MODEL], stable_lite),
            _ => prepend(
                &[
                    PRIMARY_REASONING_MODEL,
                    PRIMARY_FAST_MODEL,
                    BOOTSTRAP_LITE_MODEL,
                ],
                stable_lite,
            ),
        }
    };
    Ok(dedupe(candidates))
}

fn prepend(prefix: &[&str], tail: &[String]) -> Vec<String> {
    prefix
        .iter()
        .map(|value| (*value).to_string())
        .chain(tail.iter().cloned())
        .collect()
}

fn join(left: &[String], right: &[String]) -> Vec<String> {
    left.iter().cloned().chain(right.iter().cloned()).collect()
}

fn dedupe(models: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    models
        .into_iter()
        .filter(|model| seen.insert(model.clone()))
        .collect()
}
