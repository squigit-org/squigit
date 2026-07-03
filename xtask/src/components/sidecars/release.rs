use super::{paddle_ocr, whisper_stt};
use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component, version: &str, tag: &str) -> XtaskResult {
    match component.manifest.operations.release.handler.as_str() {
        "paddle-release" => paddle_ocr::release::run(runtime, version, tag),
        "whisper-release" => whisper_stt::release::run(runtime, version, tag),
        handler => Err(format!("unknown sidecar release handler '{handler}'")),
    }
}
