use crate::registry::Component;
use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, component: &Component) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Run the application's typecheck and collect diagnostics without rejecting warnings.
    **************************/

    runtime.success(&format!(
        "[mock] {:<18} {:<20} warnings allowed",
        component.name(),
        "npm typecheck"
    ));
    Ok(())
}
