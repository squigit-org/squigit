use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, version: &str, tag: &str) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Package, verify, tag, and publish the standalone Paddle OCR sidecar.
    **************************/

    runtime.success(&format!("[mock] releasing Paddle OCR {version}"));
    println!("  tag: {tag}");
    Ok(())
}
