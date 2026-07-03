use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, version: &str, tag: &str) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Package, verify, tag, and publish the standalone Whisper STT sidecar.
    **************************/

    runtime.success(&format!("[mock] releasing Whisper STT {version}"));
    println!("  tag: {tag}");
    Ok(())
}
