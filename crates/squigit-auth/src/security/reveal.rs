// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use chrono::{Duration, Utc};
use squigit_storage::ProfileStore;

use crate::Result;

const REVEAL_GRACE_SECONDS: i64 = 600;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RevealShell {
    Electron,
    Cli,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RevealAuthResult {
    Authorized,
    RequiresOsAuth,
    RequiresCaptcha,
    RequiresTerminalPin,
}

pub fn check_reveal_authorization(
    store: &ProfileStore,
    shell: RevealShell,
) -> Result<RevealAuthResult> {
    if shell == RevealShell::Electron {
        if let Some(ts) = store.get_last_trusted_reveal()? {
            if Utc::now().signed_duration_since(ts) < Duration::seconds(REVEAL_GRACE_SECONDS) {
                return Ok(RevealAuthResult::Authorized);
            }
        }
    }

    match shell {
        RevealShell::Cli => Ok(RevealAuthResult::RequiresTerminalPin),
        RevealShell::Electron => {
            if cfg!(target_os = "macos") || cfg!(target_os = "windows") {
                Ok(RevealAuthResult::RequiresOsAuth)
            } else {
                Ok(RevealAuthResult::RequiresCaptcha)
            }
        }
    }
}

pub fn invalidate_reveal_grace(store: &ProfileStore) -> Result<()> {
    store.invalidate_last_trusted_reveal()?;
    Ok(())
}
