// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use ops_chat_storage::StoredImage;
use parking_lot::Mutex;
use std::sync::{atomic::AtomicBool, Arc};

pub struct AppState {
    pub image_data: Arc<Mutex<Option<StoredImage>>>,
    pub auth_running: Arc<AtomicBool>,
    /// Flag set when auth is cancelled or timed out - prevents late auth from succeeding
    pub auth_cancelled: Arc<AtomicBool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            image_data: Arc::new(Mutex::new(None)),
            auth_running: Arc::new(AtomicBool::new(false)),
            auth_cancelled: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
