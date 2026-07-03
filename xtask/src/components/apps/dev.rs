use crate::registry::manifest::Operation;
use crate::registry::Component;
use crate::{Runtime, XtaskResult};
use std::fs;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const RENDERER_PORT: u16 = 1420;
const TAURI_ARCHIVE_REPOSITORY: &str = "squigit-org/tauri-v0-archive";
const TAURI_ARCHIVE_TAG: &str = "v0.1.1";

pub fn run(runtime: &Runtime, component: &Component) -> XtaskResult {
    match component.operation(Operation::Dev).handler.as_str() {
        "cli-dev" => run_cli(runtime),
        "renderer-dev" => run_renderer(runtime, component),
        "desktop-dev" => run_desktop(runtime, component),
        "tauri-dev" => run_tauri(runtime, component),
        handler => Err(format!("unknown app dev handler '{handler}'")),
    }
}

fn run_cli(runtime: &Runtime) -> XtaskResult {
    runtime.note("CLI development mode is coming soon.");
    Ok(())
}

fn run_renderer(runtime: &Runtime, component: &Component) -> XtaskResult {
    ensure_node_dependencies(runtime, &component.directory)?;
    let mut command = npm_command();
    command
        .args(["run", "dev"])
        .current_dir(&component.directory);
    run_foreground(&mut command, "npm run dev")
}

fn run_desktop(runtime: &Runtime, component: &Component) -> XtaskResult {
    require_populated_directory(
        &component.directory.join("binaries"),
        "Desktop sidecar binaries are missing. Build and package the sidecars before running dev.",
    )?;

    let renderer = runtime.repo_root.join("apps/renderer");
    ensure_node_dependencies(runtime, &renderer)?;
    ensure_node_dependencies(runtime, &component.directory)?;

    if renderer_is_ready() {
        return Err(format!(
            "Renderer port {RENDERER_PORT} is already in use. Stop the existing process and retry."
        ));
    }

    println!("\nStarting Renderer for Electron...");
    let mut vite_command = npm_command();
    vite_command
        .args(["run", "dev"])
        .current_dir(&renderer)
        .env("VITE_PLATFORM", "electron");
    let vite_child = spawn_streaming(&mut vite_command, "npm run dev")?;
    let mut vite = ManagedChild::new(vite_child);
    wait_for_renderer(&mut vite)?;

    println!("\nBuilding the Electron main process...");
    let mut build_command = npm_command();
    build_command
        .args(["run", "build"])
        .current_dir(&component.directory);
    run_foreground(&mut build_command, "npm run build")?;

    let electron_cli = component.directory.join("node_modules/electron/cli.js");
    if !electron_cli.is_file() {
        return Err(format!(
            "Electron is not installed at {}. Run npm install in {}.",
            electron_cli.display(),
            component.directory.display()
        ));
    }

    println!("\nStarting Electron...");
    let mut electron_command = Command::new("node");
    electron_command
        .arg(&electron_cli)
        .args([".", "--no-sandbox"])
        .current_dir(&component.directory)
        .env("NODE_ENV", "development")
        .env_remove("ELECTRON_RUN_AS_NODE");
    let result = run_foreground(
        &mut electron_command,
        &format!("node {} . --no-sandbox", electron_cli.display()),
    );
    vite.stop();
    result
}

fn run_tauri(runtime: &Runtime, component: &Component) -> XtaskResult {
    ensure_tauri_dependencies(runtime, component)?;
    require_populated_directory(
        &component.directory.join("binaries"),
        "Tauri sidecar binaries are missing from the frozen application.",
    )?;

    println!("\nStarting Tauri with the frozen Renderer...");
    let mut command = Command::new("cargo");
    command.arg("run").current_dir(&component.directory);
    run_foreground(&mut command, "cargo run")
}

fn ensure_node_dependencies(runtime: &Runtime, directory: &Path) -> XtaskResult {
    if directory.join("node_modules").is_dir() {
        return Ok(());
    }

    runtime.note(&format!(
        "Installing Node.js dependencies in {}...",
        runtime.relative_path(directory)
    ));
    let mut command = npm_command();
    command.args(["install"]).current_dir(directory);
    run_foreground(&mut command, "npm install")
}

fn npm_command() -> Command {
    #[cfg(windows)]
    {
        Command::new("npm.cmd")
    }
    #[cfg(not(windows))]
    {
        Command::new("npm")
    }
}

fn run_foreground(command: &mut Command, display: &str) -> XtaskResult {
    println!("  $ {display}");
    let status = command
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|error| format!("Could not start '{display}': {error}"))?;
    command_result(display, status)
}

fn spawn_streaming(command: &mut Command, display: &str) -> XtaskResult<Child> {
    println!("  $ {display}");
    command
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|error| format!("Could not start '{display}': {error}"))
}

fn command_result(display: &str, status: ExitStatus) -> XtaskResult {
    if status.success() {
        Ok(())
    } else if let Some(code) = status.code() {
        Err(format!("'{display}' exited with status {code}."))
    } else {
        Err(format!("'{display}' was terminated by a signal."))
    }
}

fn renderer_is_ready() -> bool {
    TcpStream::connect(("127.0.0.1", RENDERER_PORT)).is_ok()
}

fn wait_for_renderer(child: &mut ManagedChild) -> XtaskResult {
    println!("Waiting for Renderer on http://localhost:{RENDERER_PORT}...");
    let started = Instant::now();
    let timeout = Duration::from_secs(15);

    loop {
        if renderer_is_ready() {
            println!("Renderer is ready.");
            return Ok(());
        }
        if let Some(status) = child
            .child_mut()
            .try_wait()
            .map_err(|error| format!("Could not monitor Renderer: {error}"))?
        {
            return command_result("npm run dev", status)
                .and(Err("Renderer exited before becoming ready.".to_string()));
        }
        if started.elapsed() >= timeout {
            return Err(format!(
                "Renderer did not start on port {RENDERER_PORT} within 15 seconds."
            ));
        }
        thread::sleep(Duration::from_millis(250));
    }
}

struct ManagedChild {
    child: Option<Child>,
}

impl ManagedChild {
    fn new(child: Child) -> Self {
        Self { child: Some(child) }
    }

    fn child_mut(&mut self) -> &mut Child {
        self.child.as_mut().expect("managed child exists")
    }

    fn stop(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for ManagedChild {
    fn drop(&mut self) {
        self.stop();
    }
}

fn ensure_tauri_dependencies(runtime: &Runtime, component: &Component) -> XtaskResult {
    let host = host_target_triple()?;
    let cache = runtime.repo_root.join("target/tauri-archive");
    let sentinel = cache.join(".complete");

    if !sentinel.is_file() {
        fs::create_dir_all(&cache).map_err(|error| {
            format!(
                "Could not create Tauri dependency cache {}: {error}",
                cache.display()
            )
        })?;
        download_tauri_dependencies(runtime, &cache, &host)?;
        fs::write(&sentinel, TAURI_ARCHIVE_TAG).map_err(|error| {
            format!(
                "Could not finalize Tauri dependency cache {}: {error}",
                sentinel.display()
            )
        })?;
    }

    let renderer = cache.join("renderer-dist/index.html");
    require_file(
        &renderer,
        "The frozen Renderer is missing from the Tauri dependency cache.",
    )?;
    require_populated_directory(
        &cache.join("crates"),
        "Frozen Rust crates are missing from the Tauri dependency cache.",
    )?;

    let sidecar_name = format!("qt-capture-{host}");
    let sidecar_source = cache.join(&sidecar_name);
    require_populated_directory(
        &sidecar_source,
        "The frozen Qt Capture sidecar is missing from the Tauri dependency cache.",
    )?;
    let sidecar_destination = component.directory.join("binaries").join(sidecar_name);
    if !sidecar_destination.is_dir() {
        runtime.note("Copying the frozen Qt Capture sidecar into the Tauri application...");
        copy_directory(&sidecar_source, &sidecar_destination)?;
    }

    Ok(())
}

fn download_tauri_dependencies(runtime: &Runtime, cache: &Path, host: &str) -> XtaskResult {
    let asset = format!("tauri-deps-{host}.tar.gz");
    let url = format!(
        "https://github.com/{TAURI_ARCHIVE_REPOSITORY}/releases/download/{TAURI_ARCHIVE_TAG}/{asset}"
    );
    let tarball = cache.join("_download.tar.gz");

    runtime.note("Downloading frozen Tauri dependencies...");
    println!("  {url}");
    let mut curl = Command::new("curl");
    curl.args(["-fSL", "--progress-bar", "-o"])
        .arg(&tarball)
        .arg(&url);
    if let Err(error) = run_foreground(&mut curl, "curl <Tauri dependency archive>") {
        let _ = fs::remove_file(&tarball);
        return Err(error);
    }

    let mut tar = Command::new("tar");
    tar.args(["-xzf"]).arg(&tarball).arg("-C").arg(cache);
    let result = run_foreground(&mut tar, "tar -xzf <Tauri dependency archive>");
    let _ = fs::remove_file(&tarball);
    result
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
    parse_host_target(&stdout)
        .ok_or_else(|| "Rust did not report a host target in 'rustc -vV'.".to_string())
}

fn parse_host_target(output: &str) -> Option<String> {
    output
        .lines()
        .find_map(|line| line.strip_prefix("host: ").map(str::trim))
        .filter(|host| !host.is_empty())
        .map(str::to_string)
}

fn require_file(path: &Path, message: &str) -> XtaskResult {
    if path.is_file() {
        Ok(())
    } else {
        Err(format!("{message} Expected {}.", path.display()))
    }
}

fn require_populated_directory(path: &Path, message: &str) -> XtaskResult {
    let populated = path
        .read_dir()
        .map(|mut entries| entries.next().is_some())
        .unwrap_or(false);
    if populated {
        Ok(())
    } else {
        Err(format!("{message} Expected files in {}.", path.display()))
    }
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
        let destination_path: PathBuf = destination.join(entry.file_name());
        let file_type = entry.file_type().map_err(|error| {
            format!(
                "Could not inspect file type for {}: {error}",
                source_path.display()
            )
        })?;
        if file_type.is_dir() {
            copy_directory(&source_path, &destination_path)?;
        } else {
            fs::copy(&source_path, &destination_path).map_err(|error| {
                format!(
                    "Could not copy {} to {}: {error}",
                    source_path.display(),
                    destination_path.display()
                )
            })?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse_host_target;

    #[test]
    fn parses_rustc_host_target() {
        let output = "rustc 1.92.0\nbinary: rustc\nhost: x86_64-unknown-linux-gnu\n";
        assert_eq!(
            parse_host_target(output).as_deref(),
            Some("x86_64-unknown-linux-gnu")
        );
    }

    #[test]
    fn rejects_missing_rustc_host_target() {
        assert_eq!(parse_host_target("rustc 1.92.0\n"), None);
    }
}
