// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub(crate) struct BrainRuntimeState {
    pub(crate) worker: crate::jobs::JobWorker,
    pub(crate) summary_inflight: Arc<Mutex<HashMap<String, HashSet<String>>>>,
}
impl BrainRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            worker: crate::jobs::JobWorker::new(),
            summary_inflight: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
