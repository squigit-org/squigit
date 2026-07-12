use super::{paddle_ocr, qt_capture, whisper_stt};
use crate::components::BuildOptions;
use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component, options: &BuildOptions<'_>) -> XtaskResult {
    match component.manifest.operations.build.handler.as_str() {
        "paddle-ocr" => paddle_ocr::build::run(runtime, options.measure_payload),
        "qt-capture" => qt_capture::build::run(runtime, options.native),
        "whisper-stt" => whisper_stt::build::run(runtime, options.native),
        handler => Err(format!("unknown sidecar build handler '{handler}'")),
    }
}
