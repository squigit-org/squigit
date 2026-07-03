use crate::{Runtime, XtaskResult};

pub fn run(runtime: &Runtime, native: bool) -> XtaskResult {
    /**************************
    TYPE REAL LOGIC HERE

    Build either the native Qt debugging app or the usable packaged Rust sidecar.
    **************************/

    if native {
        runtime.success("[mock] building qt-capture native Qt application only");
    } else {
        runtime.success("[mock] building packaged qt-capture sidecar");
    }
    Ok(())
}
