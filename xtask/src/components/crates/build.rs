use crate::components::BuildOptions;
use crate::registry::Component;
use crate::{Runtime, XtaskResult};
use std::ffi::OsString;
use std::process::{Command, Stdio};

pub fn run(runtime: &Runtime, component: &Component, _options: &BuildOptions<'_>) -> XtaskResult {
    if component.name() == "napi-bridge" {
        return build_napi(runtime, component);
    }

    let manifest = component.directory.join("Cargo.toml");
    let cargo = std::env::var_os("CARGO").unwrap_or_else(|| OsString::from("cargo"));
    let mut command = Command::new(cargo);
    command
        .arg("build")
        .arg("--manifest-path")
        .arg(&manifest)
        .current_dir(&component.directory);
    run_command(
        &mut command,
        &format!("cargo build --manifest-path {}", manifest.display()),
    )?;
    runtime.success(&format!("Built {}.", component.display_name()));
    Ok(())
}

fn build_napi(runtime: &Runtime, component: &Component) -> XtaskResult {
    if !component.directory.join("node_modules").is_dir() {
        runtime.note("Installing N-API Bridge Node.js dependencies...");
        let mut install = npm_command();
        install.args(["install"]).current_dir(&component.directory);
        run_command(&mut install, "npm install")?;
    }

    let mut command = npm_command();
    command
        .args(["run", "build"])
        .current_dir(&component.directory);
    run_command(&mut command, "npm run build")?;
    runtime.success("Built the N-API Bridge Node.js addon.");
    Ok(())
}

fn npm_command() -> Command {
    if cfg!(windows) {
        Command::new("npm.cmd")
    } else {
        Command::new("npm")
    }
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
