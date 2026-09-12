// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::auth::{
    check_reveal_authorization, delete_api_key as delete_stored_api_key, encrypt_and_save_api_key,
    get_api_key_status, reveal_api_key as reveal_stored_api_key, validate_api_key, ApiKeyProvider,
    RevealAuthResult,
};
use crate::brain::provider::gemini::models::{
    DEFAULT_MODEL_EFFORT, MODEL_EFFORTS, PRIMARY_FAST_MODEL, SELECTABLE_MODELS,
};
use crate::storage::{paths::base_config_dir, rules, ProfileStore, VersionStore};
use serde::{Deserialize, Serialize};
use squigit_ocr::models::{DEFAULT_OCR_MODEL_ID, OCR_MODELS};
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;

use crate::services::ocr_models;

pub type SettingsResult<T> = std::result::Result<T, String>;

const CONFIG_FILE_NAME: &str = "config.toml";

const VALID_THEMES: &[&str] = &["system", "dark", "light"];
const VALID_CAPTURE_TYPES: &[&str] = &["traditional", "squiggle"];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SquigitConfig {
    pub model: String,
    pub effort: String,
    pub ocr_enabled: bool,
    pub ocr_language: String,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigUpdate {
    pub model: Option<String>,
    pub effort: Option<String>,
    pub ocr_enabled: Option<bool>,
    pub ocr_language: Option<String>,
}

impl Default for SquigitConfig {
    fn default() -> Self {
        Self {
            model: PRIMARY_FAST_MODEL.to_string(),
            effort: DEFAULT_MODEL_EFFORT.to_string(),
            ocr_enabled: true,
            ocr_language: DEFAULT_OCR_MODEL_ID.to_string(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopConfig {
    pub theme: String,
    pub capture_type: String,
    pub show_tray_icon: bool,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopConfigUpdate {
    pub theme: Option<String>,
    pub capture_type: Option<String>,
    pub show_tray_icon: Option<bool>,
}

impl Default for DesktopConfig {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            capture_type: "traditional".to_string(),
            show_tray_icon: true,
        }
    }
}

fn config_path() -> SettingsResult<PathBuf> {
    base_config_dir()
        .map(|directory| directory.join(CONFIG_FILE_NAME))
        .ok_or_else(|| "Could not locate Squigit's config directory".to_string())
}

fn default_config_table() -> toml::Table {
    let mut table = toml::Table::new();
    let root_defaults = SquigitConfig::default();
    table.insert(
        "model".to_string(),
        toml::Value::String(root_defaults.model),
    );
    table.insert(
        "effort".to_string(),
        toml::Value::String(root_defaults.effort),
    );
    table.insert(
        "ocr_enabled".to_string(),
        toml::Value::Boolean(root_defaults.ocr_enabled),
    );
    table.insert(
        "ocr_language".to_string(),
        toml::Value::String(root_defaults.ocr_language),
    );

    let mut desktop = toml::Table::new();
    let desktop_defaults = DesktopConfig::default();
    desktop.insert(
        "theme".to_string(),
        toml::Value::String(desktop_defaults.theme),
    );
    desktop.insert(
        "capture_type".to_string(),
        toml::Value::String(desktop_defaults.capture_type),
    );
    desktop.insert(
        "show_tray_icon".to_string(),
        toml::Value::Boolean(desktop_defaults.show_tray_icon),
    );

    table.insert("desktop".to_string(), toml::Value::Table(desktop));
    table
}

fn write_raw_config(table: &toml::Table) -> SettingsResult<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let serialized = toml::to_string_pretty(table).map_err(|error| error.to_string())?;
    fs::write(path, serialized).map_err(|error| error.to_string())
}

fn read_raw_config() -> SettingsResult<toml::Table> {
    let path = config_path()?;
    if !path.exists() {
        let defaults = default_config_table();
        write_raw_config(&defaults)?;
        return Ok(defaults);
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(err) => return Err(err.to_string()),
    };

    match toml::from_str::<toml::Table>(&content) {
        Ok(table) => Ok(table),
        Err(_) => {
            // Auto repair corrupt or invalid TOML with default values
            let defaults = default_config_table();
            write_raw_config(&defaults)?;
            Ok(defaults)
        }
    }
}

fn normalize_root_config(table: &toml::Table) -> (SquigitConfig, bool) {
    let defaults = SquigitConfig::default();
    let mut modified = false;

    let model = table
        .get("model")
        .and_then(|v| v.as_str())
        .filter(|id| SELECTABLE_MODELS.iter().any(|m| m.id == *id))
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            modified = true;
            defaults.model
        });

    let effort = table
        .get("effort")
        .and_then(|v| v.as_str())
        .filter(|e| MODEL_EFFORTS.contains(e))
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            modified = true;
            defaults.effort
        });

    let ocr_enabled = table
        .get("ocr_enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or_else(|| {
            modified = true;
            defaults.ocr_enabled
        });

    let ocr_language = table
        .get("ocr_language")
        .and_then(|v| v.as_str())
        .filter(|id| OCR_MODELS.iter().any(|m| m.id == *id))
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            modified = true;
            defaults.ocr_language
        });

    (
        SquigitConfig {
            model,
            effort,
            ocr_enabled,
            ocr_language,
        },
        modified,
    )
}

pub fn load_config() -> SettingsResult<SquigitConfig> {
    let mut table = read_raw_config()?;
    let (config, modified) = normalize_root_config(&table);

    if modified {
        table.insert(
            "model".to_string(),
            toml::Value::String(config.model.clone()),
        );
        table.insert(
            "effort".to_string(),
            toml::Value::String(config.effort.clone()),
        );
        table.insert(
            "ocr_enabled".to_string(),
            toml::Value::Boolean(config.ocr_enabled),
        );
        table.insert(
            "ocr_language".to_string(),
            toml::Value::String(config.ocr_language.clone()),
        );
        write_raw_config(&table)?;
    }

    Ok(config)
}

pub fn update_config(updates: ConfigUpdate) -> SettingsResult<SquigitConfig> {
    let mut table = read_raw_config()?;
    let (current, _) = normalize_root_config(&table);

    let next_model = updates
        .model
        .filter(|id| SELECTABLE_MODELS.iter().any(|m| m.id == id))
        .unwrap_or(current.model);
    let next_effort = updates
        .effort
        .filter(|e| MODEL_EFFORTS.contains(&e.as_str()))
        .unwrap_or(current.effort);
    let next_ocr_enabled = updates.ocr_enabled.unwrap_or(current.ocr_enabled);
    let next_ocr_language = updates
        .ocr_language
        .filter(|id| OCR_MODELS.iter().any(|m| m.id == id))
        .unwrap_or(current.ocr_language);

    let next = SquigitConfig {
        model: next_model,
        effort: next_effort,
        ocr_enabled: next_ocr_enabled,
        ocr_language: next_ocr_language,
    };

    table.insert("model".to_string(), toml::Value::String(next.model.clone()));
    table.insert(
        "effort".to_string(),
        toml::Value::String(next.effort.clone()),
    );
    table.insert(
        "ocr_enabled".to_string(),
        toml::Value::Boolean(next.ocr_enabled),
    );
    table.insert(
        "ocr_language".to_string(),
        toml::Value::String(next.ocr_language.clone()),
    );
    write_raw_config(&table)?;

    Ok(next)
}

fn normalize_desktop_config(table: &toml::Table) -> (DesktopConfig, bool) {
    let defaults = DesktopConfig::default();
    let desktop_table = match table.get("desktop").and_then(|v| v.as_table()) {
        Some(t) => t,
        None => return (defaults, true),
    };

    let mut modified = false;

    let theme = desktop_table
        .get("theme")
        .and_then(|v| v.as_str())
        .filter(|t| VALID_THEMES.contains(t))
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            modified = true;
            defaults.theme
        });

    let capture_type = desktop_table
        .get("capture_type")
        .and_then(|v| v.as_str())
        .filter(|c| VALID_CAPTURE_TYPES.contains(c))
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            modified = true;
            defaults.capture_type
        });

    let show_tray_icon = desktop_table
        .get("show_tray_icon")
        .and_then(|v| v.as_bool())
        .unwrap_or_else(|| {
            modified = true;
            defaults.show_tray_icon
        });

    (
        DesktopConfig {
            theme,
            capture_type,
            show_tray_icon,
        },
        modified,
    )
}

fn set_desktop_table(table: &mut toml::Table, config: &DesktopConfig) {
    let mut desktop = match table.remove("desktop") {
        Some(toml::Value::Table(t)) => t,
        _ => toml::Table::new(),
    };
    desktop.insert(
        "theme".to_string(),
        toml::Value::String(config.theme.clone()),
    );
    desktop.insert(
        "capture_type".to_string(),
        toml::Value::String(config.capture_type.clone()),
    );
    desktop.insert(
        "show_tray_icon".to_string(),
        toml::Value::Boolean(config.show_tray_icon),
    );
    table.insert("desktop".to_string(), toml::Value::Table(desktop));
}

pub fn load_desktop_config() -> SettingsResult<DesktopConfig> {
    let mut table = read_raw_config()?;
    let (config, modified) = normalize_desktop_config(&table);

    if modified {
        set_desktop_table(&mut table, &config);
        write_raw_config(&table)?;
    }

    Ok(config)
}

pub fn update_desktop_config(updates: DesktopConfigUpdate) -> SettingsResult<DesktopConfig> {
    let mut table = read_raw_config()?;
    let (current, _) = normalize_desktop_config(&table);

    let next_theme = updates
        .theme
        .filter(|t| VALID_THEMES.contains(&t.as_str()))
        .unwrap_or(current.theme);
    let next_capture_type = updates
        .capture_type
        .filter(|c| VALID_CAPTURE_TYPES.contains(&c.as_str()))
        .unwrap_or(current.capture_type);
    let next_show_tray_icon = updates.show_tray_icon.unwrap_or(current.show_tray_icon);
    let next = DesktopConfig {
        theme: next_theme,
        capture_type: next_capture_type,
        show_tray_icon: next_show_tray_icon,
    };

    set_desktop_table(&mut table, &next);
    write_raw_config(&table)?;

    Ok(next)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialState {
    pub configured: bool,
    pub width: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSnapshot {
    pub active_profile_id: Option<String>,
    pub config: SquigitConfig,
    pub persona: String,
    pub google_ai_studio: CredentialState,
    pub imgbb: CredentialState,
}

fn credential_state(
    store: &ProfileStore,
    profile_id: Option<&str>,
    provider: ApiKeyProvider,
) -> SettingsResult<CredentialState> {
    let Some(profile_id) = profile_id else {
        return Ok(CredentialState {
            configured: false,
            width: None,
        });
    };
    Ok(CredentialState {
        configured: get_api_key_status(store, provider, profile_id)
            .map_err(|error| error.to_string())?,
        width: store
            .get_key_width(profile_id, provider.storage_key_name())
            .map_err(|error| error.to_string())?,
    })
}

pub fn load_settings() -> SettingsResult<SettingsSnapshot> {
    let store = ProfileStore::new().map_err(|error| error.to_string())?;
    let active_profile_id = store
        .get_active_profile_id()
        .map_err(|error| error.to_string())?;
    Ok(SettingsSnapshot {
        google_ai_studio: credential_state(
            &store,
            active_profile_id.as_deref(),
            ApiKeyProvider::GoogleAiStudio,
        )?,
        imgbb: credential_state(&store, active_profile_id.as_deref(), ApiKeyProvider::ImgBb)?,
        active_profile_id,
        config: load_config()?,
        persona: load_persona()?,
    })
}

pub fn load_persona() -> SettingsResult<String> {
    let path = rules::rules_path()
        .ok_or_else(|| "Could not locate Squigit's RULES.md path".to_string())?;
    match fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error.to_string()),
    }
}

pub fn save_persona(content: &str) -> SettingsResult<()> {
    if rules::rules_path().is_none() {
        return Err("Could not locate Squigit's RULES.md path".to_string());
    }
    rules::save_rules(content)
}

pub fn import_persona(source_path: &str) -> SettingsResult<String> {
    let path = Path::new(source_path);
    let is_markdown = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"));
    if !is_markdown {
        return Err("RULES.md import requires a Markdown file".to_string());
    }
    let imported = fs::read_to_string(path).map_err(|error| error.to_string())?;
    save_persona(&imported)?;
    Ok(imported)
}

fn provider(value: &str) -> SettingsResult<ApiKeyProvider> {
    ApiKeyProvider::from_str(value).map_err(|error| error.to_string())
}

pub fn validate_api_key_format(provider_name: &str, plaintext: &str) -> SettingsResult<bool> {
    if plaintext.trim().is_empty() {
        return Ok(true);
    }
    Ok(validate_api_key(provider(provider_name)?, plaintext.trim()).is_ok())
}

pub fn set_api_key(profile_id: &str, provider_name: &str, plaintext: &str) -> SettingsResult<()> {
    let store = ProfileStore::new().map_err(|error| error.to_string())?;
    encrypt_and_save_api_key(
        &store,
        profile_id,
        provider(provider_name)?,
        plaintext.trim(),
    )
    .map_err(|error| error.to_string())
}

pub fn delete_api_key(profile_id: &str, provider_name: &str) -> SettingsResult<bool> {
    let store = ProfileStore::new().map_err(|error| error.to_string())?;
    delete_stored_api_key(&store, profile_id, provider(provider_name)?)
        .map_err(|error| error.to_string())
}

pub fn reveal_api_key(
    profile_id: &str,
    provider_name: &str,
    captcha_passed: bool,
) -> SettingsResult<Option<String>> {
    let store = ProfileStore::new().map_err(|error| error.to_string())?;
    let authorization = check_reveal_authorization(&store).map_err(|error| error.to_string())?;
    if authorization != RevealAuthResult::Authorized && !captcha_passed {
        return Err("captcha-required".to_string());
    }
    if captcha_passed {
        store
            .update_last_trusted_reveal()
            .map_err(|error| error.to_string())?;
    }
    reveal_stored_api_key(&store, provider(provider_name)?, profile_id)
        .map(|secret| secret.map(|value| value.into_inner()))
        .map_err(|error| error.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrModelStatus {
    pub id: String,
    pub name: String,
    pub lang: String,
    pub size: String,
    pub state: String,
    pub progress: u8,
    pub loaded: u64,
    pub total: u64,
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrModelsSnapshot {
    pub default_ocr_model_id: String,
    pub models: Vec<OcrModelStatus>,
}

pub fn load_ocr_models() -> SettingsResult<OcrModelsSnapshot> {
    let manager = ocr_models()?;
    let downloaded = manager
        .list_downloaded_models()
        .map_err(|error| error.to_string())?;
    let jobs = manager.download_jobs_snapshot();
    let models = OCR_MODELS
        .iter()
        .map(|model| {
            let installed =
                model.id == DEFAULT_OCR_MODEL_ID || downloaded.iter().any(|id| id == model.id);
            let job = jobs.iter().find(|job| job.id == model.id);
            let state = match job.map(|job| job.status.as_str()) {
                Some("downloaded" | "already_installed") => "downloaded".to_string(),
                Some(status) => status.to_string(),
                None if installed => "downloaded".to_string(),
                None => "idle".to_string(),
            };
            OcrModelStatus {
                id: model.id.to_string(),
                name: model.name.to_string(),
                lang: model.lang.to_string(),
                size: model.size.to_string(),
                state,
                progress: job.map_or(if installed { 100 } else { 0 }, |job| job.progress),
                loaded: job.map_or(0, |job| job.loaded),
                total: job.map_or(0, |job| job.total),
                error: job.and_then(|job| job.error.clone()),
            }
        })
        .collect();
    Ok(OcrModelsSnapshot {
        default_ocr_model_id: DEFAULT_OCR_MODEL_ID.to_string(),
        models,
    })
}

pub fn download_ocr_model(model_id: &str) -> SettingsResult<OcrModelsSnapshot> {
    ocr_models()?
        .start_download(model_id)
        .map_err(|error| error.to_string())?;
    load_ocr_models()
}

pub fn cancel_ocr_model_download(model_id: &str) -> SettingsResult<OcrModelsSnapshot> {
    ocr_models()?.cancel_download(model_id);
    load_ocr_models()
}

pub fn delete_ocr_model(model_id: &str) -> SettingsResult<OcrModelsSnapshot> {
    if model_id == DEFAULT_OCR_MODEL_ID {
        return Err("The bundled OCR model cannot be deleted".to_string());
    }
    ocr_models()?
        .trash_downloaded_model(model_id)
        .map_err(|error| error.to_string())?;
    let config = load_config()?;
    if config.ocr_language == model_id {
        update_config(ConfigUpdate {
            ocr_language: Some(DEFAULT_OCR_MODEL_ID.to_string()),
            ..Default::default()
        })?;
    }
    load_ocr_models()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelpDiagnostics {
    pub squigit_version: Option<String>,
    pub ocr_version: Option<String>,
    pub os: String,
}

fn read_ocr_version() -> SettingsResult<Option<String>> {
    let sidecar_path = squigit_ocr::sidecar::resolve_sidecar_path();
    Ok(squigit_ocr::sidecar::read_sidecar_version(&sidecar_path).ok())
}

pub fn ocr_available() -> SettingsResult<bool> {
    Ok(read_ocr_version()?.is_some())
}

fn current_squigit_version() -> SettingsResult<Option<String>> {
    Ok(VersionStore::new()
        .map_err(|error| error.to_string())?
        .load()
        .map_err(|error| error.to_string())?
        .and_then(|version| version.app.current_version)
        .map(|version| version.trim().to_string())
        .filter(|version| !version.is_empty()))
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn command_output(program: &str, arguments: &[&str]) -> Option<String> {
    std::process::Command::new(program)
        .args(arguments)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .filter(|output| !output.is_empty())
}

fn os_release() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        return fs::read_to_string("/proc/sys/kernel/osrelease")
            .ok()
            .map(|release| release.trim().to_string())
            .filter(|release| !release.is_empty());
    }
    #[cfg(target_os = "macos")]
    {
        return command_output("sw_vers", &["-productVersion"]);
    }
    #[cfg(target_os = "windows")]
    {
        return command_output("cmd", &["/C", "ver"]);
    }
    #[allow(unreachable_code)]
    None
}

fn os_diagnostics() -> String {
    let name = match std::env::consts::OS {
        "linux" => "Linux",
        "macos" => "macOS",
        "windows" => "Windows",
        other => other,
    };
    let architecture = match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    };
    match os_release() {
        Some(release) => format!("{name} {architecture} {release}"),
        None => format!("{name} {architecture}"),
    }
}

pub fn load_help_diagnostics() -> SettingsResult<HelpDiagnostics> {
    Ok(HelpDiagnostics {
        squigit_version: current_squigit_version()?,
        ocr_version: read_ocr_version()?,
        os: os_diagnostics(),
    })
}
