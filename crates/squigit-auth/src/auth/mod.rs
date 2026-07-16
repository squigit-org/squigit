// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

mod callback_server;
mod credentials;
mod google;

pub use callback_server::{
    AuthAccountPolicy, AuthFlowSettings, BrowserOpener, LoopbackAuthPage, LoopbackAuthServer,
    auth_cancelled_callback, google_auth_status_page_url_for,
};
pub use credentials::{CredentialsSource, validate_google_credentials};
pub use google::{
    AuthSuccessData, GoogleAuthAttempt, begin_google_auth_flow, complete_google_auth_flow,
    google_auth_callback_state, hydrate_avatar,
};
