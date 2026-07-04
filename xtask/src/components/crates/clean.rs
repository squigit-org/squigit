use crate::registry::Component;
use crate::{Runtime, XtaskResult};
use std::ffi::OsString;
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};

pub fn run(runtime: &Runtime, component: &Component) -> XtaskResult {
    let cargo = std::env::var_os("CARGO").unwrap_or_else(|| OsString::from("cargo"));
    let manifest = runtime.repo_root.join("Cargo.toml");
    let mut command = Command::new(cargo);
    command
        .arg("clean")
        .arg("--manifest-path")
        .arg(&manifest)
        .args(["-p", component.name()])
        .current_dir(&runtime.repo_root);
    run_command(
        &mut command,
        &format!("cargo clean -p {}", component.name()),
    )?;

    if component.name() == "napi-bridge" {
        remove_napi_artifacts(runtime, &component.directory)?;
    }
    runtime.success(&format!("Cleaned {}.", component.display_name()));
    Ok(())
}

pub(crate) fn remove_napi_artifacts(runtime: &Runtime, directory: &Path) -> XtaskResult {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("Could not read {}: {error}", directory.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Could not read an entry in {}: {error}",
                directory.display()
            )
        })?;
        let path = entry.path();
        if path
            .extension()
            .is_some_and(|extension| extension == "node")
        {
            println!("  Removing {}", runtime.relative_path(&path));
            fs::remove_file(&path)
                .map_err(|error| format!("Could not remove {}: {error}", path.display()))?;
        }
    }
    Ok(())
}

fn run_command(command: &mut Command, display: &str) -> XtaskResult {
    println!("  $ {display}");
    let status = command
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|error| format!("Could not start '{display}': {error}"))?;
    if status.success() {
        Ok(())
    } else if let Some(code) = status.code() {
        Err(format!("'{display}' exited with status {code}."))
    } else {
        Err(format!("'{display}' was terminated by a signal."))
    }
}
