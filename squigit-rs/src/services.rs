// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use squigit_brain::BrainService;
use squigit_ocr::{models::ModelManager, ocr::OcrRuntime};
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

/// Absolute path of the OCR engine installer script (squigit-tools).
/// Shared through the facade so squigit-cli can install the engine with the
/// exact same script the GUI injects into the console.
pub fn ocr_install_script_path() -> std::path::PathBuf {
    squigit_ocr::install::install_script_path()
}

/// Materialise the OCR installer script (squigit-tools) if missing and
/// return its path.
pub fn ensure_ocr_install_script() -> Result<std::path::PathBuf, String> {
    squigit_ocr::install::ensure_install_script()
}
