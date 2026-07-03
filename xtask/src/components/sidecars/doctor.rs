use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component) -> XtaskResult {
    let checker = match component.manifest.operations.doctor.handler.as_str() {
        "paddle-ocr" => "python syntax",
        "qt-capture" | "whisper-stt" => "CMake check",
        handler => return Err(format!("unknown sidecar doctor handler '{handler}'")),
    };

    /**************************
    TYPE REAL LOGIC HERE

    Run the sidecar's framework-specific checks and collect diagnostics without rejecting warnings.
    **************************/

    runtime.success(&format!(
        "[mock] {:<18} {:<20} warnings allowed",
        component.name(),
        checker
    ));
    Ok(())
}
