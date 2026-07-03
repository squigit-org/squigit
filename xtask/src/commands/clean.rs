use crate::registry::manifest::Operation;
use crate::registry::Registry;
use crate::{components, Runtime};

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if !args.is_empty() {
        return super::fail(runtime, "clean does not accept arguments.");
    }
    if registry.is_repository() {
        let mut succeeded = 0;
        let mut failed = 0;
        for component in registry.targets_for(Operation::Clean) {
            match components::clean(runtime, component) {
                Ok(()) => succeeded += 1,
                Err(error) => {
                    failed += 1;
                    runtime.error(&format!("{}: {error}", component.name()));
                }
            }
        }
        super::print_summary("Clean", succeeded, failed);
        i32::from(failed > 0)
    } else {
        let component = match super::component_operation(runtime, registry, Operation::Clean) {
            Ok(component) => component,
            Err(code) => return code,
        };
        match components::clean(runtime, component) {
            Ok(()) => 0,
            Err(error) => super::fail(runtime, &error),
        }
    }
}
