use crate::registry::Component;
use crate::{Runtime, XtaskResult};
use std::ffi::OsString;
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};

pub fn run(runtime: &Runtime, component: &Component) -> XtaskResult {
    match component.name() {
        "paddle-ocr" => clean_paddle(runtime, component)?,
        "whisper-stt" => clean_whisper(runtime, component)?,
        "qt-capture" => clean_qt(runtime, component)?,
        name => return Err(format!("unknown sidecar clean target '{name}'")),
    }
    runtime.success(&format!("Cleaned {}.", component.display_name()));
    Ok(())
}

fn clean_paddle(runtime: &Runtime, component: &Component) -> XtaskResult {
    for name in ["build", "build-xtask-check", "dist"] {
        remove(runtime, &component.directory.join(name))?;
    }
    remove(runtime, &component.directory.join("__pycache__"))?;
    for source in ["src", "scripts", "patches"] {
        remove_pycache_directories(runtime, &component.directory.join(source))?;
    }
    let host = host_target_triple()?;
    remove(
        runtime,
        &runtime
            .repo_root
            .join("packaging/binaries")
            .join(format!("paddle-ocr-{host}")),
    )?;
    remove(
        runtime,
        &runtime
            .repo_root
            .join("target/ocr-size")
            .join(format!("ocr-size-{host}.json")),
    )
}

fn clean_whisper(runtime: &Runtime, component: &Component) -> XtaskResult {
    for name in ["build", "build-xtask-check", "dist"] {
        remove(runtime, &component.directory.join(name))?;
    }
    let host = host_target_triple()?;
    remove(
        runtime,
        &runtime
            .repo_root
            .join("packaging/binaries")
            .join(format!("whisper-stt-{host}")),
    )
}

fn clean_qt(runtime: &Runtime, component: &Component) -> XtaskResult {
    let native = component.directory.join("native");
    for name in ["build", "build-xtask-check", "dist", "_internal"] {
        remove(runtime, &native.join(name))?;
    }

    let cargo = std::env::var_os("CARGO").unwrap_or_else(|| OsString::from("cargo"));
    let mut command = Command::new(cargo);
    command
        .args(["clean", "-p", "capture-engine"])
        .current_dir(&runtime.repo_root);
    run_command(&mut command, "cargo clean -p capture-engine")?;

    let host = host_target_triple()?;
    remove(
        runtime,
        &runtime.repo_root.join("apps/desktop/binaries").join(host),
    )
}

fn host_target_triple() -> XtaskResult<String> {
    let output = Command::new("rustc")
        .arg("-vV")
        .output()
        .map_err(|error| format!("Could not inspect the Rust host target: {error}"))?;
    if !output.status.success() {
        return Err("Could not inspect the Rust host target with 'rustc -vV'.".to_string());
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .find_map(|line| line.strip_prefix("host: ").map(str::trim))
        .filter(|host| !host.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "Rust did not report a host target in 'rustc -vV'.".to_string())
}

fn remove_pycache_directories(runtime: &Runtime, directory: &Path) -> XtaskResult {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Could not read {}: {error}", directory.display())),
    };
    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Could not read an entry in {}: {error}",
                directory.display()
            )
        })?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Could not inspect {}: {error}", path.display()))?;
        if file_type.is_dir() && entry.file_name() == "__pycache__" {
            remove(runtime, &path)?;
        } else if file_type.is_dir() {
            remove_pycache_directories(runtime, &path)?;
        } else if path.extension().is_some_and(|extension| extension == "pyc") {
            remove(runtime, &path)?;
        }
    }
    Ok(())
}

fn remove(runtime: &Runtime, path: &Path) -> XtaskResult {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Could not inspect {}: {error}", path.display())),
    };
    println!("  Removing {}", runtime.relative_path(path));
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
    .map_err(|error| format!("Could not remove {}: {error}", path.display()))
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
