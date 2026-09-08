// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Shared update refresh and decision logic for Squigit shells.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

use chrono::{NaiveDate, Utc};
use semver::Version;
use serde::Deserialize;
use squigit_storage::{ProductVersion, VersionFile, VersionStore, VersionType};
use thiserror::Error;

use crate::urls::SQUIGIT_RELEASES_URL;

const UPDATE_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Error)]
pub enum UpdateError {
    #[error("Network request failed: {0}")]
    Network(String),
    #[error("Invalid releases.json payload: {0}")]
    InvalidRemote(String),
    #[error("Invalid CalVer format: {0}")]
    InvalidCalVer(String),
    #[error("Invalid SemVer format: {0}")]
    InvalidSemVer(String),
    #[error("Version storage failed: {0}")]
    Storage(#[from] squigit_storage::StorageError),
    #[error("Version-store lock task failed: {0}")]
    LockTask(String),
}

pub type Result<T> = std::result::Result<T, UpdateError>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UpdateProduct {
    App,
    Cli,
    Ocr,
}

impl UpdateProduct {
    pub fn key(self) -> &'static str {
        match self {
            Self::App => "app",
            Self::Cli => "cli",
            Self::Ocr => "ocr",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::App => "Squigit",
            Self::Cli => "Squigit CLI",
            Self::Ocr => "Squigit OCR",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UpdateShell {
    App,
    Cli,
}

#[derive(Clone, Debug)]
pub struct PendingUpdate {
    pub product: UpdateProduct,
    pub product_name: String,
    pub current_version: String,
    pub latest_version: String,
    pub released_at: String,
    pub content: String,
}

#[derive(Clone, Debug, Default)]
pub struct UpdateRefreshContext {
    pub app_version: Option<String>,
    pub ocr_resource_dir: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RefreshSource {
    Network,
    Cache,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RefreshOutcome {
    pub source: RefreshSource,
}

#[derive(Debug, Deserialize)]
struct RemoteVersionFile {
    app: RemoteProductVersion,
    cli: RemoteProductVersion,
    ocr: RemoteProductVersion,
}

#[derive(Debug, Deserialize)]
struct RemoteProductVersion {
    current_version: Option<String>,
    latest_version: String,
    version_type: VersionType,
    released_at: String,
    content: String,
}

impl RemoteProductVersion {
    fn into_stored(self, current_version: Option<String>) -> ProductVersion {
        ProductVersion {
            current_version,
            latest_version: self.latest_version,
            version_type: self.version_type,
            released_at: self.released_at,
            content: self.content,
        }
    }
}

pub async fn refresh_version_file(context: UpdateRefreshContext) -> Result<RefreshOutcome> {
    let store = VersionStore::new()?;
    let lock_store = store.clone();
    let guard = tokio::task::spawn_blocking(move || lock_store.lock())
        .await
        .map_err(|error| UpdateError::LockTask(error.to_string()))??;

    let app_version = non_empty(context.app_version);
    let ocr_resource_dir = context.ocr_resource_dir;
    let (remote_result, cli_version, ocr_version) = tokio::join!(
        fetch_remote_versions(),
        discover_cli_version(),
        discover_ocr_version(ocr_resource_dir),
    );

    let remote_result = remote_result.and_then(|remote| {
        validate_remote_file(&remote)?;
        Ok(remote)
    });

    match remote_result {
        Ok(remote) => {
            let file = VersionFile {
                app: remote.app.into_stored(app_version),
                cli: remote.cli.into_stored(cli_version),
                ocr: remote.ocr.into_stored(ocr_version),
                last_fetch_at: Utc::now(),
            };
            guard.save(&file)?;
            Ok(RefreshOutcome {
                source: RefreshSource::Network,
            })
        }
        Err(network_error) => {
            let Some(mut cached) = guard.load()? else {
                return Err(network_error);
            };
            cached.app.current_version = app_version;
            cached.cli.current_version = cli_version;
            cached.ocr.current_version = ocr_version;
            guard.save(&cached)?;
            Ok(RefreshOutcome {
                source: RefreshSource::Cache,
            })
        }
    }
}

pub fn decide_update(shell: UpdateShell) -> Result<Option<PendingUpdate>> {
    let store = VersionStore::new()?;
    let Some(file) = store.load()? else {
        return Ok(None);
    };

    let (shell_product, shell_version) = match shell {
        UpdateShell::App => (UpdateProduct::App, &file.app),
        UpdateShell::Cli => (UpdateProduct::Cli, &file.cli),
    };

    match product_is_outdated(shell_version)? {
        Some(true) => return Ok(Some(pending_update(shell_product, shell_version))),
        Some(false) => {}
        None => return Ok(None),
    }

    match product_is_outdated(&file.ocr)? {
        Some(true) => Ok(Some(pending_update(UpdateProduct::Ocr, &file.ocr))),
        Some(false) | None => Ok(None),
    }
}

pub fn is_calver_outdated(current: &str, latest: &str) -> Result<bool> {
    Ok(parse_calver(current)? < parse_calver(latest)?)
}

pub fn is_semver_outdated(current: &str, latest: &str) -> Result<bool> {
    let current =
        Version::parse(current).map_err(|_| UpdateError::InvalidSemVer(current.to_string()))?;
    let latest =
        Version::parse(latest).map_err(|_| UpdateError::InvalidSemVer(latest.to_string()))?;
    Ok(current < latest)
}

fn product_is_outdated(product: &ProductVersion) -> Result<Option<bool>> {
    let Some(current) = product.current_version.as_deref() else {
        return Ok(None);
    };
    compare_versions(current, &product.latest_version, product.version_type).map(Some)
}

fn pending_update(product: UpdateProduct, version: &ProductVersion) -> PendingUpdate {
    PendingUpdate {
        product,
        product_name: product.display_name().to_string(),
        current_version: version.current_version.clone().unwrap_or_default(),
        latest_version: version.latest_version.clone(),
        released_at: version.released_at.clone(),
        content: version.content.clone(),
    }
}

fn compare_versions(current: &str, latest: &str, version_type: VersionType) -> Result<bool> {
    match version_type {
        VersionType::Calver => is_calver_outdated(current, latest),
        VersionType::Semver => is_semver_outdated(current, latest),
    }
}

fn parse_calver(value: &str) -> Result<NaiveDate> {
    let parts = value.split('.').collect::<Vec<_>>();
    if parts.len() != 3
        || parts[0].len() != 2
        || parts[1].len() != 2
        || parts[2].len() != 2
        || parts
            .iter()
            .any(|part| !part.chars().all(|character| character.is_ascii_digit()))
    {
        return Err(UpdateError::InvalidCalVer(value.to_string()));
    }

    let year = parts[0]
        .parse::<i32>()
        .map_err(|_| UpdateError::InvalidCalVer(value.to_string()))?;
    let month = parts[1]
        .parse::<u32>()
        .map_err(|_| UpdateError::InvalidCalVer(value.to_string()))?;
    let day = parts[2]
        .parse::<u32>()
        .map_err(|_| UpdateError::InvalidCalVer(value.to_string()))?;
    NaiveDate::from_ymd_opt(2000 + year, month, day)
        .ok_or_else(|| UpdateError::InvalidCalVer(value.to_string()))
}

async fn fetch_remote_versions() -> Result<RemoteVersionFile> {
    let client = reqwest::Client::builder()
        .timeout(UPDATE_REQUEST_TIMEOUT)
        .build()
        .map_err(|error| UpdateError::Network(error.to_string()))?;
    let response = client
        .get(SQUIGIT_RELEASES_URL)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|error| UpdateError::Network(error.to_string()))?;
    response
        .json::<RemoteVersionFile>()
        .await
        .map_err(|error| UpdateError::InvalidRemote(error.to_string()))
}

fn validate_remote_file(file: &RemoteVersionFile) -> Result<()> {
    validate_remote_product(&file.app)?;
    validate_remote_product(&file.cli)?;
    validate_remote_product(&file.ocr)
}

fn validate_remote_product(product: &RemoteProductVersion) -> Result<()> {
    if product.current_version.is_some() {
        return Err(UpdateError::InvalidRemote(
            "remote current_version must be null".to_string(),
        ));
    }
    compare_versions(
        &product.latest_version,
        &product.latest_version,
        product.version_type,
    )?;
    NaiveDate::parse_from_str(&product.released_at, "%Y-%m-%d")
        .map_err(|error| UpdateError::InvalidRemote(error.to_string()))?;
    Ok(())
}

async fn discover_cli_version() -> Option<String> {
    tokio::task::spawn_blocking(read_cli_version)
        .await
        .ok()
        .flatten()
}

fn read_cli_version() -> Option<String> {
    let mut command = Command::new("squigit");
    command.arg("--version");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    extract_semver(&format!("{stdout}\n{stderr}"))
}

async fn discover_ocr_version(resource_dir: Option<PathBuf>) -> Option<String> {
    tokio::task::spawn_blocking(move || read_ocr_version(resource_dir.as_deref()))
        .await
        .ok()
        .flatten()
}

fn read_ocr_version(resource_dir: Option<&Path>) -> Option<String> {
    let fallback_resource_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .unwrap_or_default();
    let resource_dir = resource_dir.unwrap_or(&fallback_resource_dir);
    let (sidecar_path, _) = ocr_runtime::sidecar::resolve_sidecar_path(resource_dir);
    ocr_runtime::sidecar::read_sidecar_version(&sidecar_path).ok()
}

fn extract_semver(raw: &str) -> Option<String> {
    raw.split(|character: char| {
        !(character.is_ascii_alphanumeric()
            || character == '.'
            || character == '-'
            || character == '+')
    })
    .filter(|part| !part.is_empty())
    .filter_map(|part| Version::parse(part).ok())
    .next_back()
    .map(|version| version.to_string())
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let value = value.trim();
        (!value.is_empty()).then(|| value.to_string())
    })
}
