use crate::registry::manifest::Operation;
use crate::registry::Component;
use crate::XtaskResult;
use std::path::Path;

// lib.rs

pub fn could_not_enter_context(path: &Path, error: &std::io::Error) -> String {
    format!(
        "Could not enter component context {}: {error}",
        path.display()
    )
}

// registry.rs

pub fn read_current_dir(error: impl std::fmt::Display) -> String {
    format!("Could not read the current directory: {error}")
}

pub fn resolve_path(path: &Path, error: impl std::fmt::Display) -> String {
    format!("Could not resolve {}: {error}", path.display())
}

pub fn resolve_repo_manifest(path: &Path, error: impl std::fmt::Display) -> String {
    format!(
        "Could not resolve repository manifest {}: {error}",
        path.display()
    )
}

pub fn read_manifest(path: &Path, error: impl std::fmt::Display) -> String {
    format!("Could not read {}: {error}", path.display())
}

pub fn parse_manifest(path: &Path, error: impl std::fmt::Display) -> String {
    format!("Invalid {}: {error}", path.display())
}

pub fn root_version_read(path: &Path, error: impl std::fmt::Display) -> String {
    format!("{}: {error}", path.display())
}

pub fn root_version_missing(path: &Path) -> String {
    format!("{}: root version source is required", path.display())
}

pub fn unregistered_component(root_path: &Path, local_path: &Path) -> String {
    format!(
        "Current component manifest is not registered by {}: {}",
        root_path.display(),
        local_path.display()
    )
}

pub fn no_release_config(component: &Component) -> String {
    format!("{} has no release configuration", component.display_name())
}

// commands.rs

pub fn unknown_command(command: &str) -> String {
    format!("Unknown command '{command}'. Run 'cargo xtask' for this context.")
}

pub fn component_only_command(command: &str) -> String {
    format!("{command} requires a component path when run from the workspace root.")
}

pub fn command_disabled(command: &str, component_name: &str, relative_path: &str) -> String {
    format!("{command} is not enabled for {component_name} by {relative_path}/xtask.toml.")
}

pub fn root_only_command(command: &str) -> String {
    format!("{command} is only available from the repository xtask context.")
}

pub fn read_confirmation(error: impl std::fmt::Display) -> String {
    format!("Could not read confirmation: {error}")
}

// components.rs

pub fn unsupported(component: &Component, operation: Operation) -> XtaskResult {
    Err(format!(
        "cannot run {} for {} using handler '{}'",
        operation.name(),
        component.display_name(),
        component.operation(operation).handler
    ))
}
