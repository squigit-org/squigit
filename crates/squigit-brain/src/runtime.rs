// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::provider::gemini::attachments::{
    AttachmentPreparationJob, GeminiFileRef, SharedAttachmentWork,
};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, Semaphore};
use tokio_util::sync::CancellationToken;

pub(crate) type ObjectManifestLocks = Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>;

#[derive(Clone)]
pub(crate) struct BrainRuntimeState {
    pub(crate) provider_file_cache: Arc<Mutex<HashMap<String, GeminiFileRef>>>,
    pub(crate) object_manifest_locks: ObjectManifestLocks,
    pub(crate) attachment_jobs: Arc<Mutex<HashMap<String, AttachmentPreparationJob>>>,
    pub(crate) attachment_work: Arc<Mutex<HashMap<String, SharedAttachmentWork>>>,
    pub(crate) attachment_preflights: Arc<Mutex<HashMap<String, CancellationToken>>>,
    pub(crate) office_conversion_slots: Arc<Semaphore>,
}

impl BrainRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            provider_file_cache: Arc::new(Mutex::new(HashMap::new())),
            object_manifest_locks: Arc::new(Mutex::new(HashMap::new())),
            attachment_jobs: Arc::new(Mutex::new(HashMap::new())),
            attachment_work: Arc::new(Mutex::new(HashMap::new())),
            attachment_preflights: Arc::new(Mutex::new(HashMap::new())),
            office_conversion_slots: Arc::new(Semaphore::new(1)),
        }
    }

    pub(crate) async fn object_manifest_lock(&self, hash: &str) -> Arc<Mutex<()>> {
        let mut locks = self.object_manifest_locks.lock().await;
        locks
            .entry(hash.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    }
}

impl Default for BrainRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}
