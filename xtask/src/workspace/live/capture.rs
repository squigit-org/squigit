use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, mode: &str) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Launch the selected interactive capture mode and report its smoke-test result.
    **************************/

    runtime.success(&format!("[mock] live capture {mode}"));
    Ok(())
}
