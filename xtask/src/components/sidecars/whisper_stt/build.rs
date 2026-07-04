use crate::{Runtime, XtaskResult};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub fn run(runtime: &Runtime) -> XtaskResult {
    runtime.heading("Building Whisper STT sidecar");

    let sidecar = runtime.repo_root.join("sidecars/whisper-stt");
    let build_dir = sidecar.join("build");

    refresh_cmake_cache_if_stale(&sidecar, &build_dir)?;
    fs::create_dir_all(&build_dir).map_err(|error| {
        format!(
            "Could not create Whisper build directory {}: {error}",
            build_dir.display()
        )
    })?;

    println!("\nConfiguring Whisper STT...");
    let mut configure = Command::new("cmake");
    configure
        .arg("-S")
        .arg(&sidecar)
        .arg("-B")
        .arg(&build_dir)
        .arg("-DCMAKE_BUILD_TYPE=Release")
        .current_dir(&runtime.repo_root);
    run_command(
        &mut configure,
        "cmake -S sidecars/whisper-stt -B sidecars/whisper-stt/build -DCMAKE_BUILD_TYPE=Release",
    )?;

    println!("\nCompiling Whisper STT...");
    let mut build = Command::new("cmake");
    build
        .arg("--build")
        .arg(&build_dir)
        .args(["--config", "Release"])
        .current_dir(&runtime.repo_root);
    run_command(
        &mut build,
        "cmake --build sidecars/whisper-stt/build --config Release",
    )?;

    package(runtime, &sidecar, &build_dir)?;
    runtime.success("Whisper STT build and packaging complete.");
    Ok(())
}

fn refresh_cmake_cache_if_stale(sidecar: &Path, build_dir: &Path) -> XtaskResult {
    let cache_path = build_dir.join("CMakeCache.txt");
    if !cache_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&cache_path).map_err(|error| {
        format!(
            "Could not read Whisper cache file {} for validation: {error}",
            cache_path.display()
        )
    })?;

    let mut cached_home_dir = None;
    let mut cached_cache_dir = None;
    for line in content.lines() {
        if let Some(value) = line.strip_prefix("CMAKE_HOME_DIRECTORY:INTERNAL=") {
            cached_home_dir = Some(value.trim().to_string());
        }
        if let Some(value) = line.strip_prefix("CMAKE_CACHEFILE_DIR:INTERNAL=") {
            cached_cache_dir = Some(value.trim().to_string());
        }
    }

    let expected_home = normalize_path(
        &sidecar
            .canonicalize()
            .unwrap_or_else(|_| sidecar.to_path_buf()),
    );
    let expected_cache = normalize_path(
        &build_dir
            .canonicalize()
            .unwrap_or_else(|_| build_dir.to_path_buf()),
    );

    let home_mismatch = cached_home_dir
        .as_deref()
        .map(normalize_path_str)
        .map(|value| value != expected_home)
        .unwrap_or(false);
    let cache_mismatch = cached_cache_dir
        .as_deref()
        .map(normalize_path_str)
        .map(|value| value != expected_cache)
        .unwrap_or(false);

    if home_mismatch || cache_mismatch {
        println!(
            "  Detected a stale Whisper CMake cache from a different source or build path; recreating the build directory..."
        );
        fs::remove_dir_all(build_dir).map_err(|error| {
            format!(
                "Could not remove stale Whisper build directory {}: {error}",
                build_dir.display()
            )
        })?;
    }

    Ok(())
}

fn package(runtime: &Runtime, sidecar: &Path, build_dir: &Path) -> XtaskResult {
    println!("\nPackaging Whisper STT sidecar artifacts for distribution...");

    let models_dir = ensure_models(sidecar)?;
    let binary = find_binary(build_dir)?;
    let runtime_libs = collect_runtime_libs(build_dir)?;
    let host = host_target_triple()?;
    let destination = whisper_package_destination(&runtime.repo_root, &host);

    remove_directory_if_present(&destination)?;
    fs::create_dir_all(&destination).map_err(|error| {
        format!(
            "Could not create Whisper package directory {}: {error}",
            destination.display()
        )
    })?;

    let destination_binary = destination.join(binary_name());
    println!("  Copying binary to {}", destination_binary.display());
    copy_file(&binary, &destination_binary)?;

    let internal = destination.join("_internal");
    fs::create_dir_all(&internal).map_err(|error| {
        format!(
            "Could not create Whisper runtime directory {}: {error}",
            internal.display()
        )
    })?;

    #[cfg(windows)]
    let runtime_lib_destination = &destination;
    #[cfg(not(windows))]
    let runtime_lib_destination = &internal;

    for library in runtime_libs {
        let Some(name) = library.file_name() else {
            continue;
        };
        let destination_library = runtime_lib_destination.join(name);
        println!(
            "  Copying runtime library to {}",
            destination_library.display()
        );
        copy_file(&library, &destination_library)?;
    }

    let models_destination = internal.join("models");
    println!("  Copying models to {}", models_destination.display());
    copy_directory(&models_dir, &models_destination)?;

    Ok(())
}

fn whisper_package_destination(repo_root: &Path, host: &str) -> PathBuf {
    repo_root
        .join("packaging/binaries")
        .join(format!("whisper-stt-{host}"))
}

fn binary_name() -> &'static str {
    if cfg!(windows) {
        "squigit-stt.exe"
    } else {
        "squigit-stt"
    }
}

fn ensure_models(sidecar: &Path) -> XtaskResult<PathBuf> {
    let models_dir = sidecar.join("models");
    let required_model = models_dir.join("ggml-tiny.en.bin");
    if !required_model.exists() {
        return Err(format!(
            "Whisper models are missing. Expected at least {}.\nRun: python sidecars/whisper-stt/download_models.py",
            required_model.display()
        ));
    }
    Ok(models_dir)
}

fn find_binary(build_dir: &Path) -> XtaskResult<PathBuf> {
    let name = binary_name();
    let mut candidates = vec![
        build_dir.join("Release").join(name),
        build_dir.join(name),
        build_dir.join("bin/Release").join(name),
        build_dir.join("bin").join(name),
    ];
    candidates.dedup();

    if let Some(binary) = candidates.iter().find(|candidate| candidate.exists()) {
        return Ok(binary.clone());
    }

    Err(format!(
        "Whisper binary was not found. Expected one of:\n  - {}",
        candidates
            .iter()
            .map(|candidate| candidate.display().to_string())
            .collect::<Vec<_>>()
            .join("\n  - ")
    ))
}

fn collect_runtime_libs(build_dir: &Path) -> XtaskResult<Vec<PathBuf>> {
    let candidates = [
        build_dir.join("bin/Release"),
        build_dir.join("bin"),
        build_dir.join("Release"),
        build_dir.join("_deps/whisper_cpp-build/ggml/src"),
        build_dir.join("_deps/whisper_cpp-build/src"),
    ];

    let mut libraries = Vec::new();
    let mut seen = HashSet::new();

    for directory in candidates {
        if !directory.is_dir() {
            continue;
        }

        let entries = fs::read_dir(&directory).map_err(|error| {
            format!(
                "Could not inspect Whisper runtime directory {}: {error}",
                directory.display()
            )
        })?;
        for entry in entries {
            let entry = entry.map_err(|error| {
                format!(
                    "Could not inspect an entry in Whisper runtime directory {}: {error}",
                    directory.display()
                )
            })?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            let lower = file_name.to_ascii_lowercase();
            if !(lower.contains("whisper") || lower.contains("ggml")) {
                continue;
            }
            if !is_runtime_library_name(&lower) {
                continue;
            }
            if seen.insert(lower) {
                libraries.push(path);
            }
        }
    }

    if libraries.is_empty() {
        return Err(format!(
            "Whisper runtime libraries were not found in build outputs. Expected Whisper/GGML shared libraries under {}/bin or {}/Release.",
            build_dir.display(),
            build_dir.display()
        ));
    }

    Ok(libraries)
}

fn is_runtime_library_name(name: &str) -> bool {
    #[cfg(windows)]
    {
        return name.ends_with(".dll");
    }

    #[cfg(target_os = "macos")]
    {
        return name.ends_with(".dylib");
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        return name.ends_with(".so") || name.contains(".so.");
    }

    #[allow(unreachable_code)]
    false
}

fn host_target_triple() -> XtaskResult<String> {
    let output = Command::new("rustc")
        .arg("-vV")
        .output()
        .map_err(|error| format!("Could not inspect the Rust host target: {error}"))?;
    if !output.status.success() {
        return Err("Could not inspect the Rust host target with 'rustc -vV'.".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .find_map(|line| line.strip_prefix("host: ").map(str::trim))
        .filter(|host| !host.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "Rust did not report a host target in 'rustc -vV'.".to_string())
}

fn normalize_path(path: &Path) -> String {
    normalize_path_str(path.to_string_lossy().as_ref())
}

fn normalize_path_str(value: &str) -> String {
    let normalized = value.replace('\\', "/").trim_end_matches('/').to_string();
    if cfg!(windows) {
        normalized.to_ascii_lowercase()
    } else {
        normalized
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

fn remove_directory_if_present(path: &Path) -> XtaskResult {
    match fs::remove_dir_all(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "Could not remove existing directory {}: {error}",
            path.display()
        )),
    }
}

fn copy_file(source: &Path, destination: &Path) -> XtaskResult {
    fs::copy(source, destination).map(|_| ()).map_err(|error| {
        format!(
            "Could not copy {} to {}: {error}",
            source.display(),
            destination.display()
        )
    })
}

fn copy_directory(source: &Path, destination: &Path) -> XtaskResult {
    fs::create_dir_all(destination).map_err(|error| {
        format!(
            "Could not create directory {}: {error}",
            destination.display()
        )
    })?;
    let entries = fs::read_dir(source)
        .map_err(|error| format!("Could not read directory {}: {error}", source.display()))?;

    for entry in entries {
        let entry = entry
            .map_err(|error| format!("Could not read an entry in {}: {error}", source.display()))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        let file_type = entry.file_type().map_err(|error| {
            format!(
                "Could not inspect file type for {}: {error}",
                source_path.display()
            )
        })?;
        if file_type.is_dir() {
            copy_directory(&source_path, &destination_path)?;
        } else {
            copy_file(&source_path, &destination_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::whisper_package_destination;
    use std::path::Path;

    #[test]
    fn package_destination_is_scoped_by_host() {
        assert_eq!(
            whisper_package_destination(Path::new("/repo"), "aarch64-apple-darwin"),
            Path::new("/repo/packaging/binaries/whisper-stt-aarch64-apple-darwin")
        );
    }
}
