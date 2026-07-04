use crate::registry::manifest::{Category, Operation};
use crate::registry::Registry;
use crate::{components, Runtime, XtaskResult};
use std::ffi::OsString;
use std::process::{Command, Stdio};

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if !args.is_empty() {
        return super::fail(runtime, "clean does not accept arguments.");
    }
    if registry.is_repository() {
        let mut succeeded = 0;
        let mut failed = 0;
        let targets = registry.targets_for(Operation::Clean);
        let crate_count = targets
            .iter()
            .filter(|component| component.category() == Category::Crates)
            .count();
        match clean_workspace_cargo(runtime).and_then(|()| {
            components::crates::clean::remove_napi_artifacts(
                runtime,
                &runtime.repo_root.join("crates/napi-bridge"),
            )
        }) {
            Ok(()) => succeeded += crate_count,
            Err(error) => {
                failed += 1;
                runtime.error(&format!("Rust workspace: {error}"));
            }
        }
        for component in targets
            .into_iter()
            .filter(|component| component.category() != Category::Crates)
        {
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

fn clean_workspace_cargo(runtime: &Runtime) -> XtaskResult {
    let cargo = std::env::var_os("CARGO").unwrap_or_else(|| OsString::from("cargo"));
    let manifest = runtime.repo_root.join("Cargo.toml");
    let mut command = Command::new(cargo);
    command
        .arg("clean")
        .arg("--manifest-path")
        .arg(&manifest)
        .current_dir(&runtime.repo_root);
    println!("  $ cargo clean --manifest-path {}", manifest.display());
    let status = command
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|error| format!("Could not start 'cargo clean': {error}"))?;
    if status.success() {
        Ok(())
    } else if let Some(code) = status.code() {
        Err(format!("'cargo clean' exited with status {code}."))
    } else {
        Err("'cargo clean' was terminated by a signal.".to_string())
    }
}
