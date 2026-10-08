// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use super::errors::ProviderError;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::{Mutex as SyncMutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

pub const DEFAULT_MODEL_ID: &str = "free";
pub const DEFAULT_MODEL_EFFORT: &str = "medium";
pub const MODEL_EFFORTS: &[&str] = &["instant", "medium", "high", "xhigh"];
const LUNA: &str = "~openai/gpt-luna-latest";
const FAMILIES: &[(&str, &str, &str)] = &[
    (
        "~anthropic/claude-fable-latest",
        "Claude Fable Latest",
        "Anthropic",
    ),
    (
        "~anthropic/claude-opus-latest",
        "Claude Opus Latest",
        "Anthropic",
    ),
    (
        "~anthropic/claude-sonnet-latest",
        "Claude Sonnet Latest",
        "Anthropic",
    ),
    (LUNA, "GPT Luna Latest", "OpenAI"),
    ("~openai/gpt-sol-latest", "GPT Sol Latest", "OpenAI"),
    ("~openai/gpt-astra-latest", "GPT Astra Latest", "OpenAI"),
    (
        "~google/gemini-flash-latest",
        "Gemini Flash Latest",
        "Google",
    ),
    ("~google/gemini-pro-latest", "Gemini Pro Latest", "Google"),
];

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableModel {
    pub id: String,
    pub name: String,
    pub provider: String,
}

#[derive(Clone, Debug)]
pub(crate) enum ModelSelection {
    Free,
    Family(String),
}

impl ModelSelection {
    pub(crate) fn parse(id: &str) -> Result<Self, String> {
        if id == DEFAULT_MODEL_ID {
            Ok(Self::Free)
        } else if FAMILIES.iter().any(|(family, _, _)| *family == id) {
            Ok(Self::Family(id.to_string()))
        } else {
            Err("Unsupported model selection".to_string())
        }
    }
    pub(crate) fn is_free(&self) -> bool {
        matches!(self, Self::Free)
    }
}

pub async fn list_available_models() -> Result<Vec<AvailableModel>, String> {
    let catalog = catalog(true)
        .await
        .map_err(|error| error.user_error().message)?;
    let mut result = FAMILIES
        .iter()
        .map(|(id, name, publisher)| AvailableModel {
            id: id.to_string(),
            name: catalog
                .iter()
                .find(|model| model.id == *id)
                .map(|model| resolved_model_name(&model.metadata, name))
                .unwrap_or_else(|| name.to_string()),
            provider: publisher.to_string(),
        })
        .collect::<Vec<_>>();
    result.push(AvailableModel {
        id: DEFAULT_MODEL_ID.to_string(),
        name: "Free".to_string(),
        provider: "Free".to_string(),
    });
    Ok(result)
}
fn resolved_model_name(metadata: &Value, fallback: &str) -> String {
    metadata
        .pointer("/alias_target/name")
        .and_then(Value::as_str)
        .map(|name| name.split_once(": ").map_or(name, |(_, name)| name))
        .map(|name| name.strip_suffix(" Preview").unwrap_or(name).to_string())
        .unwrap_or_else(|| fallback.to_string())
}
pub fn valid_model_id(id: &str) -> bool {
    ModelSelection::parse(id).is_ok()
}
pub fn canonical_model_label(id: &str) -> Option<String> {
    if id == DEFAULT_MODEL_ID {
        Some("Free".to_string())
    } else {
        FAMILIES
            .iter()
            .find(|(family, _, _)| *family == id)
            .map(|(_, label, _)| label.to_string())
    }
}

#[derive(Clone, Debug)]
pub(crate) struct Candidate {
    pub(crate) id: String,
    metadata: Value,
    latency: Option<f64>,
    availability: Option<f64>,
}
impl Candidate {
    fn supports(&self, parameter: &str) -> bool {
        self.metadata["supported_parameters"]
            .as_array()
            .is_some_and(|items| items.iter().any(|item| item.as_str() == Some(parameter)))
    }
    pub(crate) fn supports_input(&self, modality: &str) -> bool {
        self.metadata
            .pointer("/architecture/input_modalities")
            .and_then(Value::as_array)
            .is_some_and(|items| items.iter().any(|item| item.as_str() == Some(modality)))
    }
    fn vision_chat(&self) -> bool {
        let architecture = &self.metadata["architecture"];
        architecture["input_modalities"]
            .as_array()
            .is_some_and(|items| items.iter().any(|item| item == "image"))
            && architecture["output_modalities"]
                .as_array()
                .is_some_and(|items| items.len() == 1 && items[0] == "text")
            && ![
                "safety",
                "guard",
                "moderation",
                "embedding",
                "rerank",
                "image-generation",
                "batch",
            ]
            .iter()
            .any(|hint| self.id.to_ascii_lowercase().contains(hint))
    }
    fn controlled_reasoning(&self) -> bool {
        let r = &self.metadata["reasoning"];
        r.get("supported_efforts").is_some_and(|levels| {
            levels.is_null()
                || levels.as_array().is_some_and(|levels| {
                    levels
                        .iter()
                        .any(|level| level.as_str().is_some_and(|level| level != "none"))
                })
        }) || r["supports_max_tokens"] == true
    }
    pub(crate) fn output_budget(&self, micro: bool) -> u64 {
        let maximum = self
            .metadata
            .pointer("/top_provider/max_completion_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(16_384)
            .min(self.metadata["context_length"].as_u64().unwrap_or(16_384));
        maximum.min(if micro { 8_192 } else { 32_768 })
    }
    pub(crate) fn reasoning(&self, effort: Option<&str>, output_budget: u64) -> Option<Value> {
        let r = self.metadata.get("reasoning")?.as_object()?;
        let instant = effort.is_none() || effort == Some("instant");
        let exclude = effort != Some("xhigh");
        let mandatory = r.get("mandatory") == Some(&json!(true));
        let order = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
        if let Some(levels) = r.get("supported_efforts") {
            let supported = order
                .iter()
                .filter(|level| {
                    (!mandatory || **level != "none")
                        && (levels.is_null()
                            || levels.as_array().is_some_and(|items| {
                                items.iter().any(|item| item.as_str() == Some(**level))
                            }))
                })
                .copied()
                .collect::<Vec<_>>();
            let level = if instant {
                supported.first().copied()
            } else {
                let target = order
                    .iter()
                    .position(|level| Some(*level) == effort)
                    .unwrap_or(3);
                supported
                    .iter()
                    .find(|level| {
                        order.iter().position(|item| item == *level).unwrap_or(0) >= target
                    })
                    .copied()
                    .or_else(|| supported.last().copied())
            }?;
            return Some(json!({"effort":level, "exclude":exclude}));
        }
        if instant && !mandatory {
            return Some(json!({"enabled":false, "exclude":true}));
        }
        if r.get("supports_max_tokens") == Some(&json!(true)) {
            let minimum = r.get("min_tokens").and_then(Value::as_u64).unwrap_or(1_024);
            let maximum = r
                .get("max_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(output_budget.saturating_sub(1_024));
            let ratio = match effort {
                Some("medium") => 50,
                Some("high") => 80,
                Some("xhigh") => 95,
                _ => 0,
            };
            let budget = (output_budget * ratio / 100)
                .max(minimum)
                .min(maximum)
                .min(output_budget.saturating_sub(1));
            return Some(json!({"max_tokens":budget, "exclude":exclude}));
        }
        None
    }
    pub(crate) fn instant_reasoning(&self) -> Value {
        if self.supports("reasoning") {
            json!({"effort":"low", "exclude":true})
        } else {
            json!({"exclude":true})
        }
    }
    fn lightweight_score(&self) -> f64 {
        let text = format!(
            "{} {}",
            self.id,
            self.metadata["name"].as_str().unwrap_or("")
        )
        .to_ascii_lowercase();
        let words = text
            .split(|c: char| !(c.is_ascii_alphanumeric() || c == '.'))
            .collect::<Vec<_>>();
        let active = words
            .iter()
            .filter_map(|word| {
                word.strip_prefix('a')
                    .and_then(|s| s.strip_suffix('b'))
                    .and_then(|s| s.parse::<f64>().ok())
            })
            .reduce(f64::min);
        let parameters = words
            .iter()
            .filter_map(|word| word.strip_suffix('b').and_then(|s| s.parse::<f64>().ok()))
            .reduce(f64::min);
        active.or(parameters).unwrap_or_else(|| {
            if ["nano", "lite", "small", "mini", "flash"]
                .iter()
                .any(|hint| text.contains(hint))
            {
                10.0
            } else {
                1_000.0
            }
        })
    }
}

struct Catalog {
    fetched: Instant,
    models: Vec<Candidate>,
}
static CATALOG: OnceLock<Mutex<Option<Catalog>>> = OnceLock::new();
type ModelHealth = BTreeMap<(bool, String), (Instant, bool)>;
static MODEL_HEALTH: OnceLock<SyncMutex<ModelHealth>> = OnceLock::new();

pub(crate) fn record_outcome(id: &str, micro: bool, succeeded: bool) {
    if let Ok(mut health) = MODEL_HEALTH
        .get_or_init(|| SyncMutex::new(BTreeMap::new()))
        .lock()
    {
        health.retain(|_, (updated, _)| updated.elapsed() < Duration::from_secs(900));
        health.insert((micro, id.to_string()), (Instant::now(), succeeded));
    }
}

async fn catalog(refresh: bool) -> Result<Vec<Candidate>, ProviderError> {
    let mut cache = CATALOG.get_or_init(|| Mutex::new(None)).lock().await;
    if let Some(catalog) = cache
        .as_ref()
        .filter(|catalog| !refresh && catalog.fetched.elapsed() < Duration::from_secs(900))
    {
        return Ok(catalog.models.clone());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| ProviderError::local(&error.to_string()))?;
    let response = client
        .get("https://openrouter.ai/api/v1/models")
        .send()
        .await
        .map_err(|error| {
            ProviderError::new("network")
                .with_details(json!({"endpoint":"models", "message":error.to_string()}))
        })?;
    let status = response.status();
    let raw = response.text().await.map_err(|error| {
        ProviderError::new("network").with_details(
            json!({"endpoint":"models", "httpStatus":status.as_u16(), "message":error.to_string()}),
        )
    })?;
    let body: Value = serde_json::from_str(&raw).unwrap_or_else(|_| Value::String(raw));
    if !status.is_success() || body.get("error").is_some() {
        return Err(ProviderError::response(status.as_u16(), &body));
    }
    let mut models = body["data"]
        .as_array()
        .ok_or_else(|| {
            ProviderError::new("unexpected").with_details(
                json!({"endpoint":"models", "httpStatus":status.as_u16(), "response":body}),
            )
        })?
        .iter()
        .filter_map(|item| {
            Some(Candidate {
                id: item["id"].as_str()?.to_string(),
                metadata: item.clone(),
                latency: None,
                availability: None,
            })
        })
        .collect::<Vec<_>>();
    let futures = models
        .iter()
        .enumerate()
        .filter(|(_, m)| eligible_free(m))
        .map(|(index, m)| {
            let client = client.clone();
            let id = m.id.clone();
            async move {
                let metrics = async {
                    let response = client
                        .get(format!(
                            "https://openrouter.ai/api/v1/models/{id}/endpoints"
                        ))
                        .send()
                        .await
                        .ok()?;
                    if !response.status().is_success() {
                        return None;
                    }
                    let body: Value = response.json().await.ok()?;
                    let endpoints = body.pointer("/data/endpoints")?.as_array()?;
                    let latency = endpoints
                        .iter()
                        .filter_map(|endpoint| {
                            endpoint
                                .pointer("/latency_last_30m/p50")
                                .and_then(Value::as_f64)
                                .filter(|n| n.is_finite() && *n > 0.0)
                        })
                        .reduce(f64::min);
                    let availability = endpoints
                        .iter()
                        .filter_map(|endpoint| {
                            endpoint["uptime_last_30m"]
                                .as_f64()
                                .filter(|value| value.is_finite())
                        })
                        .reduce(f64::max);
                    Some((latency, availability))
                }
                .await;
                (index, metrics)
            }
        });
    let metrics = futures_util::future::join_all(futures).await;
    for (index, metrics) in metrics {
        if let Some((latency, availability)) = metrics {
            models[index].latency = latency;
            models[index].availability = availability;
        }
    }
    *cache = Some(Catalog {
        fetched: Instant::now(),
        models: models.clone(),
    });
    Ok(models)
}
fn eligible_free(model: &Candidate) -> bool {
    let zero = |key| {
        model.metadata["pricing"][key]
            .as_str()
            .and_then(|price| price.parse::<f64>().ok())
            == Some(0.0)
    };
    zero("prompt")
        && zero("completion")
        && ["image", "request"]
            .iter()
            .all(|key| model.metadata["pricing"].get(key).is_none() || zero(key))
        && model.vision_chat()
        && model
            .metadata
            .pointer("/architecture/tokenizer")
            .and_then(Value::as_str)
            != Some("Router")
        && !model.id.starts_with('~')
}

pub(crate) async fn job_candidates(
    selection: &ModelSelection,
    micro: bool,
    needs_tools: bool,
    effort: Option<&str>,
) -> Result<Vec<Candidate>, ProviderError> {
    let models = catalog(false).await?;
    match selection {
        ModelSelection::Free => {
            let mut pool = models
                .into_iter()
                .filter(|model| {
                    eligible_free(model)
                        && (!needs_tools || model.supports("tools"))
                        && if micro {
                            model.supports("structured_outputs")
                        } else {
                            if effort == Some("instant") {
                                model.metadata.pointer("/reasoning/mandatory") != Some(&json!(true))
                                    && model.metadata.pointer("/reasoning/default_enabled")
                                        != Some(&json!(true))
                            } else {
                                model.controlled_reasoning()
                            }
                        }
                })
                .collect::<Vec<_>>();
            let health = MODEL_HEALTH
                .get_or_init(|| SyncMutex::new(BTreeMap::new()))
                .lock()
                .map(|health| health.clone())
                .unwrap_or_default();
            let health_rank = |model: &Candidate| match health.get(&(micro, model.id.clone())) {
                Some((updated, true)) if updated.elapsed() < Duration::from_secs(900) => {
                    (0, std::cmp::Reverse(Some(*updated)))
                }
                Some((updated, false)) if updated.elapsed() < Duration::from_secs(300) => {
                    (2, std::cmp::Reverse(None))
                }
                _ => (1, std::cmp::Reverse(None)),
            };
            pool.sort_by(|a, b| {
                health_rank(a)
                    .cmp(&health_rank(b))
                    .then_with(|| match (a.availability, b.availability) {
                        (Some(a), Some(b)) => b.total_cmp(&a),
                        (Some(_), None) => std::cmp::Ordering::Less,
                        (None, Some(_)) => std::cmp::Ordering::Greater,
                        _ => std::cmp::Ordering::Equal,
                    })
                    .then_with(|| match (a.latency, b.latency) {
                        (Some(a), Some(b)) => a.total_cmp(&b),
                        (Some(_), None) => std::cmp::Ordering::Less,
                        (None, Some(_)) => std::cmp::Ordering::Greater,
                        _ => std::cmp::Ordering::Equal,
                    })
                    .then_with(|| a.lightweight_score().total_cmp(&b.lightweight_score()))
                    .then_with(|| {
                        b.metadata["created"]
                            .as_u64()
                            .cmp(&a.metadata["created"].as_u64())
                    })
                    .then_with(|| a.id.cmp(&b.id))
            });
            if pool.is_empty() {
                return Err(ProviderError::new("model-unavailable").with_details(
                    json!({"message":"No compatible free vision model is currently available"}),
                ));
            }
            Ok(pool)
        }
        ModelSelection::Family(id) => {
            let selected = if micro {
                if let Some(luna) = models.iter().find(|model| model.id == LUNA) {
                    Some(luna.clone())
                } else {
                    models
                        .iter()
                        .filter(|model| {
                            model.id.starts_with("google/")
                                && model.id.contains("flash-lite")
                                && model.vision_chat()
                        })
                        .max_by_key(|model| model.metadata["created"].as_u64())
                        .cloned()
                }
            } else {
                models.iter().find(|model| &model.id == id).cloned()
            };
            selected.map(|model| vec![model]).ok_or_else(|| {
                ProviderError::new("model-unavailable").with_details(json!({"model":id, "message":"The selected model is currently unavailable in the OpenRouter catalog"}))
            })
        }
    }
}
pub async fn build_attempt_plan(model_id: &str, effort: &str) -> Result<Vec<String>, String> {
    if !MODEL_EFFORTS.contains(&effort) {
        return Err("Unsupported effort".to_string());
    }
    Ok(
        job_candidates(&ModelSelection::parse(model_id)?, false, true, Some(effort))
            .await
            .map_err(|error| error.user_error().message)?
            .into_iter()
            .map(|model| model.id)
            .collect(),
    )
}
