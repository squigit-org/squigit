use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Run cargo check for the selected crate and collect diagnostics without rejecting warnings.
    **************************/

    runtime.success(&format!(
        "[mock] {:<18} {:<20} warnings allowed",
        component.name(),
        "cargo check"
    ));
    Ok(())
}
