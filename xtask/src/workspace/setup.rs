pub mod cmake;
pub mod node;
pub mod python;
pub mod qt;

use crate::registry::manifest::SetupStage;
use crate::{Runtime, XtaskResult};

pub fn run_stage(runtime: &Runtime, stage: &SetupStage) -> XtaskResult {
    match stage.handler.as_str() {
        "cmake" => cmake::run(runtime),
        "node" => node::run(runtime),
        "python" => python::run(runtime),
        "qt" => qt::run(runtime),
        handler => Err(format!("unknown setup handler '{handler}'")),
    }
}
