/*
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn get_app_config_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .expect("Could not resolve app config dir")
}

pub fn open_url(url: &str) -> Result<(), String> {
    // Try to open using specific browsers to ensure it opens in a new tab
    // especially on Linux where xdg-open might spawn a new window
    #[cfg(target_os = "linux")]
    {
        use webbrowser::{Browser, open_browser};
        if open_browser(Browser::Chrome, url).is_ok()
            || open_browser(Browser::Firefox, url).is_ok()
        {
            return Ok(());
        }
    }

    // Fallback to default system handler
    webbrowser::open(url).map_err(|e| e.to_string())
}
