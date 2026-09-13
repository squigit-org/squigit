// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

const DEMO_ENV: &str = "SQUIGIT_CLI_DEMO";
const EMBEDDED_GOOGLE_CREDENTIALS: &str = include_str!(env!("SQUIGIT_CLI_GOOGLE_CREDENTIALS_FILE"));

pub fn demo_enabled() -> bool {
    std::env::var(DEMO_ENV)
        .ok()
        .is_some_and(|value| !value.trim().is_empty() && value != "0")
}

pub fn initialize(demo: bool) -> Result<(), String> {
    if !demo {
        squigit::profile::set_google_credentials_json(EMBEDDED_GOOGLE_CREDENTIALS);
        return Ok(());
    }

    let gemini = environment_secret("GEMINI_API_KEY");
    let imgbb = environment_secret("IMGBB_API_KEY");
    squigit::cli::initialize_contributor_mode(gemini.as_deref(), imgbb.as_deref())?;
    Ok(())
}

fn environment_secret(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}
