// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use napi::{Error, Result};
use napi_derive::napi;
use squigit_memory::identity::{Config, Soul};

#[napi(object)]
pub struct NapiSoul {
    pub name: String,
}

#[napi(object)]
pub struct NapiIdentityConfig {
    pub prompt: String,
    pub soul: Option<NapiSoul>,
}

#[napi]
pub fn get_identity_config() -> Result<NapiIdentityConfig> {
    let config = Config::load();
    Ok(NapiIdentityConfig {
        prompt: config.prompt,
        soul: config.soul.map(|s| NapiSoul { name: s.name }),
    })
}

#[napi]
pub fn set_identity_prompt(prompt: String) -> Result<()> {
    let mut config = Config::load();
    config.prompt = prompt;
    config.save().map_err(|e| Error::from_reason(e))
}

#[napi]
pub fn set_identity_soul(name: String, markdown: String) -> Result<()> {
    let mut config = Config::load();
    config.soul = Some(Soul { name, markdown });
    config.save().map_err(|e| Error::from_reason(e))
}

#[napi]
pub fn remove_identity_soul() -> Result<()> {
    let mut config = Config::load();
    config.soul = None;
    config.save().map_err(|e| Error::from_reason(e))
}
