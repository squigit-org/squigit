/*
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

use parking_lot::Mutex;
use std::sync::{atomic::AtomicBool, Arc};

pub struct AppState {
    pub image_data: Arc<Mutex<Option<String>>>,
    pub watcher_running: Arc<AtomicBool>,
    pub auth_running: Arc<AtomicBool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            image_data: Arc::new(Mutex::new(None)),
            watcher_running: Arc::new(AtomicBool::new(false)),
            auth_running: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
