// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod callback_server;
mod credentials;
mod google;

pub use callback_server::{
    google_auth_status_page_url_for, AuthAccountPolicy, AuthFlowSettings, BrowserOpener,
    LoopbackAuthPage, LoopbackAuthServer,
};
pub use credentials::{validate_google_credentials, CredentialsSource};
pub use google::{
    begin_google_auth_flow, complete_google_auth_flow, google_auth_callback_state, hydrate_avatar,
    AuthSuccessData, GoogleAuthAttempt,
};
