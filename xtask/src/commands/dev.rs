use crate::registry::manifest::Operation;
use crate::registry::Registry;
use crate::{components, console, Runtime};

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if registry.is_repository() {
        if args.is_empty() {
            console::render_root_screen(runtime, registry, "dev");
            return 0;
        }
        return super::fail(runtime, "dev requires a registered component path.");
    }
    let component = match super::component_operation(runtime, registry, Operation::Dev) {
        Ok(component) => component,
        Err(code) => return code,
    };
    if !args.is_empty() {
        return super::fail(runtime, "dev does not accept arguments.");
    }
    match components::dev(runtime, component) {
        Ok(()) => 0,
        Err(error) => super::fail(runtime, &error),
    }
}
