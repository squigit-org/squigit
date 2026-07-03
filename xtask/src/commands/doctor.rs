use crate::registry::manifest::Operation;
use crate::registry::Registry;
use crate::{components, workspace, Runtime};

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if !args.is_empty() {
        return super::fail(runtime, "doctor does not accept arguments or mode flags.");
    }

    if registry.is_repository() {
        let mut succeeded = 0;
        let mut failed = 0;
        match workspace::doctor::environment(runtime) {
            Ok(()) => succeeded += 1,
            Err(error) => {
                failed += 1;
                runtime.error(&format!("environment: {error}"));
            }
        }
        println!("\nReviewing components...\n");
        for component in registry.targets_for(Operation::Doctor) {
            match components::doctor(runtime, component) {
                Ok(()) => succeeded += 1,
                Err(error) => {
                    failed += 1;
                    runtime.error(&format!("{}: {error}", component.name()));
                }
            }
        }
        super::print_summary("Doctor", succeeded, failed);
        i32::from(failed > 0)
    } else {
        let component = match super::component_operation(runtime, registry, Operation::Doctor) {
            Ok(component) => component,
            Err(code) => return code,
        };
        match components::doctor(runtime, component) {
            Ok(()) => 0,
            Err(error) => super::fail(runtime, &error),
        }
    }
}
