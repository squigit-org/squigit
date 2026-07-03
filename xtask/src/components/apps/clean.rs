use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Remove generated application output without disturbing unrelated workspace state.
    **************************/

    runtime.success(&format!("[mock] cleaning {}", component.name()));
    Ok(())
}
