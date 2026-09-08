// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use ocr_runtime::{models::ModelManager, ocr::OcrRuntime};
use squigit_brain::BrainService;
use std::sync::OnceLock;

static BRAIN_SERVICE: OnceLock<BrainService> = OnceLock::new();
static OCR_RUNTIME: OnceLock<OcrRuntime> = OnceLock::new();
static OCR_MODEL_MANAGER: OnceLock<ModelManager> = OnceLock::new();

pub fn brain() -> &'static BrainService {
    BRAIN_SERVICE.get_or_init(BrainService::new)
}

pub(crate) fn ocr() -> &'static OcrRuntime {
    OCR_RUNTIME.get_or_init(OcrRuntime::new)
}

pub(crate) fn ocr_models() -> Result<&'static ModelManager, String> {
    if OCR_MODEL_MANAGER.get().is_none() {
        let manager = ModelManager::new().map_err(|error| error.to_string())?;
        manager.start_monitor();
        let _ = OCR_MODEL_MANAGER.set(manager);
    }
    OCR_MODEL_MANAGER
        .get()
        .ok_or_else(|| "OCR model manager did not initialize".to_string())
}
