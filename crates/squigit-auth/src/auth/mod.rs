// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod callback_server;
mod credentials;
mod google;
mod templates;

pub use callback_server::{AuthAccountPolicy, AuthFlowSettings, BrowserOpener};
pub use credentials::{validate_google_credentials, CredentialsSource};
pub use google::{hydrate_avatar, start_google_auth_flow, AuthSuccessData};
