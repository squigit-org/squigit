// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use flate2::read::GzDecoder;
use reqwest::blocking::Client;
use reqwest::StatusCode;
use semver::Version;
use serde_json::Value;
use std::env;
use std::fs;
use std::io::{Cursor, Read};
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant};
use tar::Archive;

const CRATES_API: &str = "https://crates.io/api/v1";

#[derive(Clone, Debug)]
pub struct PublishedVersion {
    pub version: Version,
    pub download_path: String,
}

#[derive(Debug)]
pub struct PackageState {
    pub latest: Option<Version>,
    pub exact: Option<PublishedVersion>,
}

pub struct Registry {
    client: Client,
}

impl Registry {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .user_agent("squigit-xtask/0.1")
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|error| format!("could not initialize crates.io client: {error}"))?;
        Ok(Self { client })
    }

    pub fn package_state(&self, name: &str, local: &Version) -> Result<PackageState, String> {
        let response = self
            .client
            .get(format!("{CRATES_API}/crates/{name}"))
            .send()
            .map_err(|error| format!("could not query crates.io for {name}: {error}"))?;
        if response.status() == StatusCode::NOT_FOUND {
            return Ok(PackageState {
                latest: None,
                exact: None,
            });
        }
        let response = response
            .error_for_status()
            .map_err(|error| format!("crates.io rejected the {name} query: {error}"))?;
        let payload: Value = response
            .json()
            .map_err(|error| format!("could not decode crates.io response for {name}: {error}"))?;
        let versions = payload["versions"]
            .as_array()
            .ok_or_else(|| format!("crates.io response for {name} has no versions array"))?;
        let mut latest = None;
        let mut exact = None;
        for item in versions {
            let Some(number) = item["num"].as_str() else {
                continue;
            };
            let Ok(version) = Version::parse(number) else {
                continue;
            };
            if version.pre.is_empty()
                && version.build.is_empty()
                && !item["yanked"].as_bool().unwrap_or(false)
                && latest.as_ref().is_none_or(|current| version > *current)
            {
                latest = Some(version.clone());
            }
            if &version == local {
                let download_path = item["dl_path"]
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("/api/v1/crates/{name}/{version}/download"));
                exact = Some(PublishedVersion {
                    version,
                    download_path,
                });
            }
        }
        Ok(PackageState { latest, exact })
    }

    pub fn published_vcs_sha(&self, package: &PublishedVersion) -> Result<String, String> {
        let url = if package.download_path.starts_with("http://")
            || package.download_path.starts_with("https://")
        {
            package.download_path.clone()
        } else {
            format!("https://crates.io{}", package.download_path)
        };
        let bytes = self
            .client
            .get(url)
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|error| {
                format!(
                    "could not download published crate version {}: {error}",
                    package.version
                )
            })?
            .bytes()
            .map_err(|error| format!("could not read published crate archive: {error}"))?;
        let decoder = GzDecoder::new(Cursor::new(bytes));
        let mut archive = Archive::new(decoder);
        for entry in archive
            .entries()
            .map_err(|error| format!("could not inspect published crate archive: {error}"))?
        {
            let mut entry =
                entry.map_err(|error| format!("invalid crate archive entry: {error}"))?;
            let path = entry
                .path()
                .map_err(|error| format!("invalid crate archive path: {error}"))?;
            if path.file_name().and_then(|name| name.to_str()) != Some(".cargo_vcs_info.json") {
                continue;
            }
            let mut source = String::new();
            entry
                .read_to_string(&mut source)
                .map_err(|error| format!("could not read .cargo_vcs_info.json: {error}"))?;
            let payload: Value = serde_json::from_str(&source)
                .map_err(|error| format!("invalid .cargo_vcs_info.json: {error}"))?;
            return payload["git"]["sha1"]
                .as_str()
                .map(str::to_string)
                .ok_or_else(|| {
                    "published crate has no Git commit in .cargo_vcs_info.json".to_string()
                });
        }
        Err("published crate has no .cargo_vcs_info.json".to_string())
    }

    pub fn wait_for_version(&self, name: &str, version: &Version) -> Result<(), String> {
        let started = Instant::now();
        let timeout = Duration::from_secs(10 * 60);
        loop {
            if self.package_state(name, version)?.exact.is_some() {
                return Ok(());
            }
            if started.elapsed() >= timeout {
                return Err(format!(
                    "crates.io did not expose {name} {version} within ten minutes"
                ));
            }
            println!("Waiting for crates.io to expose {name} {version}...");
            thread::sleep(Duration::from_secs(10));
        }
    }

    pub fn validate_publish_token(&self) -> Result<(), String> {
        let token = cargo_registry_token()?.ok_or_else(|| {
            "crates.io authentication is missing; run `cargo login` or set CARGO_REGISTRY_TOKEN"
                .to_string()
        })?;
        self.client
            .get(format!("{CRATES_API}/me"))
            .header("Authorization", token)
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .map_err(|error| format!("crates.io authentication failed: {error}"))?;
        Ok(())
    }
}

fn cargo_registry_token() -> Result<Option<String>, String> {
    if let Some(token) = env::var("CARGO_REGISTRY_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        return Ok(Some(token));
    }
    let cargo_home = env::var_os("CARGO_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".cargo")))
        .or_else(|| env::var_os("USERPROFILE").map(|home| PathBuf::from(home).join(".cargo")));
    let Some(cargo_home) = cargo_home else {
        return Ok(None);
    };
    let path = cargo_home.join("credentials.toml");
    let source = match fs::read_to_string(&path) {
        Ok(source) => source,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("could not read {}: {error}", path.display())),
    };
    let document = source
        .parse::<toml_edit::DocumentMut>()
        .map_err(|error| format!("could not parse {}: {error}", path.display()))?;
    let token = document
        .get("registry")
        .and_then(|registry| registry.get("token"))
        .and_then(toml_edit::Item::as_str)
        .or_else(|| {
            document
                .get("registries")
                .and_then(|registries| registries.get("crates-io"))
                .and_then(|registry| registry.get("token"))
                .and_then(toml_edit::Item::as_str)
        })
        .map(str::to_string);
    if token.is_some() {
        return Ok(token);
    }
    Ok(None)
}
