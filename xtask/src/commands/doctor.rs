use crate::registry::manifest::{Category, Operation, Requirements};
use crate::registry::{Component, Registry};
use crate::{Runtime, XtaskResult};
use std::collections::HashSet;
use std::env;
use std::ffi::{OsStr, OsString};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if !args.is_empty() {
        return super::fail(runtime, "doctor does not accept arguments or mode flags.");
    }

    let components = if registry.is_repository() {
        registry.targets_for(Operation::Doctor)
    } else {
        let component = match super::component_operation(runtime, registry, Operation::Doctor) {
            Ok(component) => component,
            Err(code) => return code,
        };
        vec![component]
    };

    let os = match HostOs::current() {
        Ok(os) => os,
        Err(error) => return super::fail(runtime, &error),
    };
    let needs = FrameworkNeeds::for_components(&components);
    let tools = Toolchain::discover(os, needs);
    print_framework_report(runtime, registry, &tools, needs);

    println!();
    runtime.heading("Reviewing Component Syntax");

    let mut summary = DoctorSummary::default();
    for component in components {
        println!("\n{}", runtime.console.bold(component.display_name()));
        let missing = tools.missing_for(&component.manifest.requirements);
        if !missing.is_empty() {
            summary.skipped += 1;
            runtime.note(&format!("  skipped: missing {}", missing.join(", ")));
            continue;
        }

        match check_component(runtime, component, &tools) {
            Ok(()) => {
                summary.succeeded += 1;
                runtime.success("  syntax ready");
            }
            Err(error) => {
                summary.failed += 1;
                runtime.error(&format!("  {error}"));
            }
        }
    }

    println!(
        "\nDoctor summary: {} succeeded, {} failed, {} skipped",
        summary.succeeded, summary.failed, summary.skipped
    );
    i32::from(summary.failed > 0 || summary.skipped > 0)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum HostOs {
    Linux,
    Macos,
    Windows,
}

impl HostOs {
    fn current() -> Result<Self, String> {
        if cfg!(target_os = "linux") {
            Ok(Self::Linux)
        } else if cfg!(target_os = "macos") {
            Ok(Self::Macos)
        } else if cfg!(target_os = "windows") {
            Ok(Self::Windows)
        } else {
            Err(format!(
                "doctor does not support this operating system: {}",
                env::consts::OS
            ))
        }
    }

    const fn label(self) -> &'static str {
        match self {
            Self::Linux => "linux",
            Self::Macos => "macos",
            Self::Windows => "windows",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct FrameworkNeeds {
    node: bool,
    python: bool,
    cmake: bool,
    qt: bool,
}

impl FrameworkNeeds {
    fn for_components(components: &[&Component]) -> Self {
        let mut needs = Self::default();
        for component in components {
            needs.include(&component.manifest.requirements);
        }
        needs
    }

    fn include(&mut self, requirements: &Requirements) {
        self.node |= requirements.node;
        self.python |= requirements.python;
        self.cmake |= requirements.cmake || requirements.qt;
        self.qt |= requirements.qt;
    }
}

#[derive(Clone, Debug)]
struct PythonCommand {
    path: PathBuf,
    prefix_args: Vec<OsString>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct QtInstallation {
    qmake: PathBuf,
    version: String,
    prefix: PathBuf,
}

#[derive(Clone, Debug)]
struct Toolchain {
    os: HostOs,
    node: Option<PathBuf>,
    npm: Option<PathBuf>,
    npx: Option<PathBuf>,
    pnpm: Option<PathBuf>,
    python: Option<PythonCommand>,
    cmake: Option<PathBuf>,
    qt: Option<QtInstallation>,
}

impl Toolchain {
    fn discover(os: HostOs, needs: FrameworkNeeds) -> Self {
        Self {
            os,
            node: needs
                .node
                .then(|| resolve_program(os, &["node"], ToolKind::Node))
                .flatten(),
            npm: needs
                .node
                .then(|| resolve_program(os, &["npm"], ToolKind::Npm))
                .flatten(),
            npx: needs
                .node
                .then(|| resolve_program(os, &["npx"], ToolKind::Npx))
                .flatten(),
            pnpm: needs
                .node
                .then(|| resolve_program(os, &["pnpm"], ToolKind::Pnpm))
                .flatten(),
            python: needs.python.then(|| resolve_python(os)).flatten(),
            cmake: needs
                .cmake
                .then(|| resolve_program(os, &["cmake"], ToolKind::Cmake))
                .flatten(),
            qt: needs.qt.then(|| resolve_qt(os)).flatten(),
        }
    }

    fn missing_for(&self, requirements: &Requirements) -> Vec<&'static str> {
        let mut missing = Vec::new();
        if requirements.node {
            if self.node.is_none() {
                missing.push("node");
            }
            if self.npm.is_none() {
                missing.push("npm");
            }
            if self.npx.is_none() {
                missing.push("npx");
            }
        }
        if requirements.python && self.python.is_none() {
            missing.push("python3");
        }
        if (requirements.cmake || requirements.qt) && self.cmake.is_none() {
            missing.push("cmake");
        }
        if requirements.qt && self.qt.is_none() {
            missing.push("Qt 6/qmake");
        }
        missing
    }
}

#[derive(Clone, Copy, Debug)]
enum ToolKind {
    Node,
    Npm,
    Npx,
    Pnpm,
    Python,
    Cmake,
}

#[derive(Default)]
struct DoctorSummary {
    succeeded: usize,
    failed: usize,
    skipped: usize,
}

fn print_framework_report(
    runtime: &Runtime,
    registry: &Registry,
    tools: &Toolchain,
    needs: FrameworkNeeds,
) {
    let title = if registry.is_repository() {
        "Repository Framework"
    } else {
        "Component Framework"
    };
    runtime.heading(title);
    println!("\nOS: {}", tools.os.label());

    if needs.node {
        println!("\nNode");
        print_required_tool(runtime, "node", tools.node.as_deref());
        print_required_tool(runtime, "npm", tools.npm.as_deref());
        print_required_tool(runtime, "npx", tools.npx.as_deref());
        print_optional_tool(runtime, "pnpm", tools.pnpm.as_deref());
    }
    if needs.python {
        println!("\nPython");
        print_required_tool(
            runtime,
            "python3",
            tools.python.as_ref().map(|python| python.path.as_path()),
        );
    }
    if needs.cmake || needs.qt {
        println!("\nNative");
        print_required_tool(runtime, "cmake", tools.cmake.as_deref());
        if needs.qt {
            match &tools.qt {
                Some(qt) => {
                    println!(
                        "  {:<10} {:<54} {}",
                        "qmake6",
                        qt.qmake.display(),
                        runtime.console.green("ready")
                    );
                    println!(
                        "  {:<10} {:<54} {}",
                        "Qt 6",
                        format!("{} ({})", qt.version, qt.prefix.display()),
                        runtime.console.green("ready")
                    );
                }
                None => {
                    println!(
                        "  {:<10} {:<54} {}",
                        "qmake6",
                        "missing or not Qt 6",
                        runtime.console.red("missing")
                    );
                }
            }
        }
    }
    if !needs.node && !needs.python && !needs.cmake && !needs.qt {
        println!("\n  Cargo is already active; no external framework tools are required.");
    }
}

fn print_required_tool(runtime: &Runtime, name: &str, path: Option<&Path>) {
    match path {
        Some(path) => println!(
            "  {name:<10} {:<54} {}",
            path.display(),
            runtime.console.green("ready")
        ),
        None => println!(
            "  {name:<10} {:<54} {}",
            "not found",
            runtime.console.red("missing")
        ),
    }
}

fn print_optional_tool(runtime: &Runtime, name: &str, path: Option<&Path>) {
    match path {
        Some(path) => println!(
            "  {name:<10} {:<54} {}",
            path.display(),
            runtime.console.green("ready")
        ),
        None => println!(
            "  {name:<10} {:<54} {}",
            "not found",
            runtime.console.yellow("optional")
        ),
    }
}

fn check_component(runtime: &Runtime, component: &Component, tools: &Toolchain) -> XtaskResult {
    match component.operation(Operation::Doctor).handler.as_str() {
        "node-app" | "node-package" => check_typescript(runtime, component, tools),
        "cargo-crate" => check_cargo(component),
        "paddle-ocr" => check_python(runtime, component, tools),
        "qt-capture" => check_qt_capture(component, tools),
        "whisper-stt" => check_whisper(component, tools),
        handler => Err(format!("unknown doctor handler '{handler}'")),
    }
}

fn check_typescript(runtime: &Runtime, component: &Component, tools: &Toolchain) -> XtaskResult {
    let npx = tools
        .npx
        .as_ref()
        .ok_or_else(|| "npx is required for TypeScript checks".to_string())?;
    let dependency_root = if component.category() == Category::Packages {
        runtime.repo_root.join("apps/renderer")
    } else {
        component.directory.clone()
    };
    let tsconfig = component.directory.join("tsconfig.json");
    if !tsconfig.is_file() {
        return Err(format!(
            "TypeScript config is missing: {}",
            tsconfig.display()
        ));
    }

    let mut command = Command::new(npx);
    command
        .args(typescript_args(&tsconfig))
        .current_dir(&dependency_root);
    prepend_tool_directories(
        &mut command,
        [
            tools.node.as_deref(),
            tools.npm.as_deref(),
            tools.npx.as_deref(),
        ],
    )?;
    run_checked(
        &mut command,
        &format!("npx --no-install tsc --noEmit -p {}", tsconfig.display()),
    )
}

fn check_cargo(component: &Component) -> XtaskResult {
    let manifest = component.directory.join("Cargo.toml");
    let cargo = env::var_os("CARGO").unwrap_or_else(|| OsString::from("cargo"));
    let mut command = Command::new(cargo);
    command
        .args(cargo_check_args(&manifest))
        .current_dir(&component.directory);
    run_checked(
        &mut command,
        &format!("cargo check --manifest-path {}", manifest.display()),
    )
}

fn check_python(runtime: &Runtime, component: &Component, tools: &Toolchain) -> XtaskResult {
    let python = tools
        .python
        .as_ref()
        .ok_or_else(|| "python3 is required for Python syntax checks".to_string())?;
    let candidates = [
        component.directory.join("src"),
        component.directory.join("scripts"),
        component.directory.join("patches"),
        component.directory.join("download_models.py"),
    ];
    let sources = candidates
        .into_iter()
        .filter(|path| path.exists())
        .collect::<Vec<_>>();
    if sources.is_empty() {
        return Err("No Python sources were found.".to_string());
    }

    let pycache = runtime
        .temp_root
        .join("doctor/python")
        .join(component.name());
    fs::create_dir_all(&pycache)
        .map_err(|error| format!("Could not create {}: {error}", pycache.display()))?;
    let mut command = Command::new(&python.path);
    command
        .args(&python.prefix_args)
        .args(python_compile_args(&sources))
        .env("PYTHONPYCACHEPREFIX", &pycache)
        .current_dir(&component.directory);
    run_checked(&mut command, "python3 -m compileall -q -f <sources>")
}

fn check_qt_capture(component: &Component, tools: &Toolchain) -> XtaskResult {
    let mut errors = Vec::new();
    if let Err(error) = check_cargo(component) {
        errors.push(error);
    }
    let source = component.directory.join("native");
    let build = source.join("build-xtask-check");
    let qt_prefix = tools.qt.as_ref().map(|qt| qt.prefix.as_path());
    if let Err(error) = check_cmake_configure(tools, &source, &build, qt_prefix) {
        errors.push(error);
    }
    combine_check_errors(errors)
}

fn check_whisper(component: &Component, tools: &Toolchain) -> XtaskResult {
    let mut errors = Vec::new();
    if let Err(error) = check_cargo(component) {
        errors.push(error);
    }
    let source = component.directory.join("native");
    let build = source.join("build-xtask-check");
    if let Err(error) = preflight_whisper(&component.directory, &build) {
        errors.push(error);
    } else if let Err(error) = check_cmake_configure(tools, &source, &build, None) {
        errors.push(error);
    }
    combine_check_errors(errors)
}

fn preflight_whisper(sidecar: &Path, build: &Path) -> XtaskResult {
    let required = [
        build.join("_deps/whisper_cpp-src/CMakeLists.txt"),
        build.join("_deps/json-src/CMakeLists.txt"),
        build.join("_deps/miniaudio/miniaudio.h"),
        sidecar.join("models/ggml-tiny.en.bin"),
    ];
    let missing = required
        .iter()
        .filter(|path| !path.is_file())
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>();
    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "offline Whisper prerequisites are missing:\n    {}\n  configure/build Whisper once with network access before running doctor",
            missing.join("\n    ")
        ))
    }
}

fn check_cmake_configure(
    tools: &Toolchain,
    source: &Path,
    build: &Path,
    qt_prefix: Option<&Path>,
) -> XtaskResult {
    let cmake = tools
        .cmake
        .as_ref()
        .ok_or_else(|| "cmake is required for native checks".to_string())?;
    let args = cmake_configure_args(source, build, qt_prefix);
    let mut command = Command::new(cmake);
    command.args(&args).current_dir(source);
    run_checked(
        &mut command,
        &format!(
            "cmake -S {} -B {} (offline)",
            source.display(),
            build.display()
        ),
    )
}

fn cmake_configure_args(source: &Path, build: &Path, qt_prefix: Option<&Path>) -> Vec<OsString> {
    let mut args = vec![
        OsString::from("-S"),
        source.as_os_str().to_os_string(),
        OsString::from("-B"),
        build.as_os_str().to_os_string(),
        OsString::from("-DCMAKE_BUILD_TYPE=Debug"),
    ];
    if let Some(prefix) = qt_prefix {
        args.push(OsString::from(format!(
            "-DCMAKE_PREFIX_PATH={}",
            prefix.display()
        )));
    }
    args
}

fn typescript_args(tsconfig: &Path) -> Vec<OsString> {
    vec![
        OsString::from("--no-install"),
        OsString::from("tsc"),
        OsString::from("--noEmit"),
        OsString::from("-p"),
        tsconfig.as_os_str().to_os_string(),
    ]
}

fn cargo_check_args(manifest: &Path) -> Vec<OsString> {
    vec![
        OsString::from("check"),
        OsString::from("--manifest-path"),
        manifest.as_os_str().to_os_string(),
    ]
}

fn python_compile_args(sources: &[PathBuf]) -> Vec<OsString> {
    let mut args = ["-m", "compileall", "-q", "-f"]
        .into_iter()
        .map(OsString::from)
        .collect::<Vec<_>>();
    args.extend(sources.iter().map(|path| path.as_os_str().to_os_string()));
    args
}

fn combine_check_errors(errors: Vec<String>) -> XtaskResult {
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("\n  "))
    }
}

fn run_checked(command: &mut Command, display: &str) -> XtaskResult {
    println!("  $ {display}");
    let status = command
        .stdin(Stdio::null())
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

fn prepend_tool_directories<'a>(
    command: &mut Command,
    tools: impl IntoIterator<Item = Option<&'a Path>>,
) -> XtaskResult {
    let mut paths = tools
        .into_iter()
        .flatten()
        .filter_map(Path::parent)
        .map(Path::to_path_buf)
        .collect::<Vec<_>>();
    if let Some(current) = env::var_os("PATH") {
        paths.extend(env::split_paths(&current));
    }
    let paths = dedupe_paths(paths);
    let value = env::join_paths(paths)
        .map_err(|error| format!("Could not prepare framework PATH: {error}"))?;
    command.env("PATH", value);
    Ok(())
}

fn resolve_program(os: HostOs, names: &[&str], kind: ToolKind) -> Option<PathBuf> {
    let mut candidates = programs_on_path(os, names);
    candidates.extend(platform_program_candidates(os, kind));
    first_existing(candidates)
}

fn resolve_python(os: HostOs) -> Option<PythonCommand> {
    let names: &[&str] = if os == HostOs::Windows {
        &["python3", "python", "py"]
    } else {
        &["python3", "python"]
    };
    let mut candidates = programs_on_path(os, names);
    candidates.extend(platform_program_candidates(os, ToolKind::Python));
    for path in dedupe_paths(candidates) {
        if !path.is_file() {
            continue;
        }
        let is_launcher = path
            .file_stem()
            .and_then(OsStr::to_str)
            .is_some_and(|name| name.eq_ignore_ascii_case("py"));
        let prefix_args = if is_launcher {
            vec![OsString::from("-3")]
        } else {
            Vec::new()
        };
        if validates_python3(&path, &prefix_args) {
            return Some(PythonCommand { path, prefix_args });
        }
    }
    None
}

fn validates_python3(path: &Path, prefix_args: &[OsString]) -> bool {
    Command::new(path)
        .args(prefix_args)
        .args([
            "-c",
            "import sys; raise SystemExit(sys.version_info.major != 3)",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

fn resolve_qt(os: HostOs) -> Option<QtInstallation> {
    let mut candidates = programs_on_path(os, &["qmake6", "qmake-qt6", "qmake"]);
    candidates.extend(qt_program_candidates(os));
    dedupe_paths(candidates)
        .into_iter()
        .filter(|path| path.is_file())
        .find_map(|qmake| query_qt(&qmake))
}

fn query_qt(qmake: &Path) -> Option<QtInstallation> {
    let output = Command::new(qmake)
        .arg("-query")
        .stdin(Stdio::null())
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    qt_installation_from_query(qmake, &String::from_utf8_lossy(&output.stdout))
}

fn qt_installation_from_query(qmake: &Path, output: &str) -> Option<QtInstallation> {
    let values = parse_qmake_query(output);
    let version = values
        .iter()
        .find(|(key, _)| key == "QT_VERSION")?
        .1
        .clone();
    if !version.starts_with("6.") {
        return None;
    }
    let prefix = values
        .iter()
        .find(|(key, _)| key == "QT_INSTALL_PREFIX")
        .map(|(_, value)| PathBuf::from(value))?;
    Some(QtInstallation {
        qmake: qmake.to_path_buf(),
        version,
        prefix,
    })
}

fn parse_qmake_query(output: &str) -> Vec<(String, String)> {
    output
        .lines()
        .filter_map(|line| line.split_once(':'))
        .map(|(key, value)| (key.trim().to_string(), value.trim().to_string()))
        .collect()
}

fn programs_on_path(os: HostOs, names: &[&str]) -> Vec<PathBuf> {
    let paths = env::var_os("PATH")
        .map(|value| env::split_paths(&value).collect::<Vec<_>>())
        .unwrap_or_default();
    let path_ext = env::var_os("PATHEXT");
    find_in_paths(os, names, &paths, path_ext.as_deref())
}

fn find_in_paths(
    os: HostOs,
    names: &[&str],
    paths: &[PathBuf],
    path_ext: Option<&OsStr>,
) -> Vec<PathBuf> {
    let extensions = windows_extensions(path_ext);
    let mut matches = Vec::new();
    for name in names {
        for directory in paths {
            if os == HostOs::Windows && Path::new(name).extension().is_none() {
                for extension in &extensions {
                    matches.push(directory.join(format!("{name}{extension}")));
                }
            } else {
                matches.push(directory.join(name));
            }
        }
    }
    matches
}

fn windows_extensions(path_ext: Option<&OsStr>) -> Vec<String> {
    path_ext
        .and_then(OsStr::to_str)
        .map(|value| {
            value
                .split(';')
                .filter(|extension| !extension.is_empty())
                .map(|extension| extension.to_ascii_lowercase())
                .collect::<Vec<_>>()
        })
        .filter(|extensions| !extensions.is_empty())
        .unwrap_or_else(|| vec![".exe".to_string(), ".cmd".to_string(), ".bat".to_string()])
}

fn platform_program_candidates(os: HostOs, kind: ToolKind) -> Vec<PathBuf> {
    let names: &[&str] = match kind {
        ToolKind::Node => &["node"],
        ToolKind::Npm => &["npm"],
        ToolKind::Npx => &["npx"],
        ToolKind::Pnpm => &["pnpm"],
        ToolKind::Python => &["python3", "python", "py"],
        ToolKind::Cmake => &["cmake"],
    };
    let roots = platform_program_roots(os, kind);
    let extensions = windows_extensions(env::var_os("PATHEXT").as_deref());
    let mut candidates = Vec::new();
    for root in roots {
        for name in names {
            if os == HostOs::Windows {
                for extension in &extensions {
                    candidates.push(root.join(format!("{name}{extension}")));
                }
            } else {
                candidates.push(root.join(name));
            }
        }
        if os == HostOs::Windows && matches!(kind, ToolKind::Python) {
            if let Ok(versions) = fs::read_dir(&root) {
                for version in versions.flatten().filter(|entry| entry.path().is_dir()) {
                    for name in names {
                        for extension in &extensions {
                            candidates.push(version.path().join(format!("{name}{extension}")));
                        }
                    }
                }
            }
        }
    }
    candidates
}

fn platform_program_roots(os: HostOs, kind: ToolKind) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    match os {
        HostOs::Linux => {
            roots.extend([PathBuf::from("/usr/bin"), PathBuf::from("/usr/local/bin")]);
            if matches!(
                kind,
                ToolKind::Node | ToolKind::Npm | ToolKind::Npx | ToolKind::Pnpm
            ) {
                if let Some(home) = home_dir() {
                    roots.push(home.join(".local/bin"));
                }
            }
            if matches!(kind, ToolKind::Cmake) {
                roots.push(PathBuf::from("/snap/bin"));
            }
        }
        HostOs::Macos => {
            roots.extend([
                PathBuf::from("/opt/homebrew/bin"),
                PathBuf::from("/usr/local/bin"),
                PathBuf::from("/usr/bin"),
            ]);
            if matches!(kind, ToolKind::Cmake) {
                roots.push(PathBuf::from("/Applications/CMake.app/Contents/bin"));
            }
        }
        HostOs::Windows => {
            if matches!(
                kind,
                ToolKind::Node | ToolKind::Npm | ToolKind::Npx | ToolKind::Pnpm
            ) {
                if let Some(program_files) = env::var_os("ProgramFiles") {
                    roots.push(PathBuf::from(program_files).join("nodejs"));
                }
                if let Some(program_files) = env::var_os("ProgramFiles(x86)") {
                    roots.push(PathBuf::from(program_files).join("nodejs"));
                }
                if let Some(local) = env::var_os("LocalAppData") {
                    roots.push(PathBuf::from(local).join("Programs/nodejs"));
                }
                if let Some(app_data) = env::var_os("AppData") {
                    roots.push(PathBuf::from(app_data).join("npm"));
                }
            }
            if matches!(kind, ToolKind::Python) {
                if let Some(local) = env::var_os("LocalAppData") {
                    roots.push(PathBuf::from(local).join("Programs/Python"));
                }
                if let Some(program_files) = env::var_os("ProgramFiles") {
                    roots.push(PathBuf::from(program_files).join("Python"));
                }
            }
            if matches!(kind, ToolKind::Cmake) {
                if let Some(program_files) = env::var_os("ProgramFiles") {
                    roots.push(PathBuf::from(program_files).join("CMake/bin"));
                }
                roots.push(PathBuf::from(r"C:\ProgramData\chocolatey\bin"));
                if let Some(home) = home_dir() {
                    roots.push(home.join("scoop/shims"));
                }
            }
        }
    }
    roots
}

fn qt_program_candidates(os: HostOs) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    for variable in ["QTDIR", "Qt6_DIR"] {
        if let Some(value) = env::var_os(variable) {
            add_qt_prefix_candidates(
                &normalize_qt_prefix(PathBuf::from(value)),
                os,
                &mut candidates,
            );
        }
    }
    if let Some(value) = env::var_os("CMAKE_PREFIX_PATH") {
        for prefix in env::split_paths(&value) {
            add_qt_prefix_candidates(&normalize_qt_prefix(prefix), os, &mut candidates);
        }
    }

    let mut roots = Vec::new();
    match os {
        HostOs::Linux => {
            candidates.extend([
                PathBuf::from("/usr/bin/qmake6"),
                PathBuf::from("/usr/bin/qmake-qt6"),
                PathBuf::from("/usr/lib/qt6/bin/qmake6"),
            ]);
            roots.push(PathBuf::from("/opt/Qt"));
            if let Some(home) = home_dir() {
                roots.push(home.join("Qt"));
            }
        }
        HostOs::Macos => {
            for prefix in [
                "/opt/homebrew/opt/qt",
                "/opt/homebrew/opt/qt@6",
                "/usr/local/opt/qt",
                "/usr/local/opt/qt@6",
            ] {
                add_qt_prefix_candidates(Path::new(prefix), os, &mut candidates);
            }
            if let Some(home) = home_dir() {
                roots.push(home.join("Qt"));
            }
        }
        HostOs::Windows => {
            roots.push(PathBuf::from(r"C:\Qt"));
            if let Some(home) = home_dir() {
                roots.push(home.join("Qt"));
            }
        }
    }
    for root in roots {
        add_qt_tree_candidates(&root, os, &mut candidates);
    }
    candidates
}

fn add_qt_tree_candidates(root: &Path, os: HostOs, candidates: &mut Vec<PathBuf>) {
    add_qt_prefix_candidates(root, os, candidates);
    let Ok(versions) = fs::read_dir(root) else {
        return;
    };
    for version in versions.flatten().filter(|entry| entry.path().is_dir()) {
        add_qt_prefix_candidates(&version.path(), os, candidates);
        if let Ok(kits) = fs::read_dir(version.path()) {
            for kit in kits.flatten().filter(|entry| entry.path().is_dir()) {
                add_qt_prefix_candidates(&kit.path(), os, candidates);
            }
        }
    }
}

fn add_qt_prefix_candidates(prefix: &Path, os: HostOs, candidates: &mut Vec<PathBuf>) {
    let bin = prefix.join("bin");
    let names: &[&str] = if os == HostOs::Windows {
        &["qmake6.exe", "qmake.exe"]
    } else {
        &["qmake6", "qmake-qt6", "qmake"]
    };
    candidates.extend(names.iter().map(|name| bin.join(name)));
}

fn normalize_qt_prefix(mut path: PathBuf) -> PathBuf {
    if path
        .file_name()
        .and_then(OsStr::to_str)
        .is_some_and(|name| name.eq_ignore_ascii_case("Qt6"))
    {
        for _ in 0..3 {
            if let Some(parent) = path.parent() {
                path = parent.to_path_buf();
            }
        }
    }
    path
}

fn first_existing(paths: Vec<PathBuf>) -> Option<PathBuf> {
    dedupe_paths(paths).into_iter().find(|path| path.is_file())
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    paths
        .into_iter()
        .filter(|path| seen.insert(path.clone()))
        .collect()
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn unix_path_resolution_preserves_candidate_order() {
        let temp = tempdir().expect("tempdir");
        let first = temp.path().join("first");
        let second = temp.path().join("second");
        fs::create_dir_all(&first).expect("first directory");
        fs::create_dir_all(&second).expect("second directory");
        fs::write(second.join("node"), "").expect("node fixture");

        let candidates = find_in_paths(HostOs::Linux, &["node"], &[first, second.clone()], None);
        assert_eq!(first_existing(candidates), Some(second.join("node")));
    }

    #[test]
    fn windows_path_resolution_uses_pathext() {
        let temp = tempdir().expect("tempdir");
        fs::write(temp.path().join("npx.cmd"), "").expect("npx fixture");
        let candidates = find_in_paths(
            HostOs::Windows,
            &["npx"],
            &[temp.path().to_path_buf()],
            Some(OsStr::new(".EXE;.CMD")),
        );
        assert_eq!(
            first_existing(candidates),
            Some(temp.path().join("npx.cmd"))
        );
    }

    #[test]
    fn qmake_query_parser_exposes_qt_version_and_prefix() {
        let parsed =
            parse_qmake_query("QT_INSTALL_PREFIX:/opt/Qt/6.8.0/gcc_64\nQT_VERSION:6.8.0\n");
        assert!(parsed.contains(&("QT_VERSION".to_string(), "6.8.0".to_string())));
        assert!(parsed.contains(&(
            "QT_INSTALL_PREFIX".to_string(),
            "/opt/Qt/6.8.0/gcc_64".to_string()
        )));
    }

    #[test]
    fn qt_five_is_not_accepted_as_qt_six() {
        assert!(qt_installation_from_query(
            Path::new("qmake"),
            "QT_VERSION:5.15.2\nQT_INSTALL_PREFIX:/usr\n"
        )
        .is_none());
    }

    #[test]
    fn qt_six_query_becomes_a_resolved_installation() {
        let qt = qt_installation_from_query(
            Path::new("/usr/bin/qmake6"),
            "QT_VERSION:6.4.2\nQT_INSTALL_PREFIX:/usr\n",
        )
        .expect("Qt 6 installation");
        assert_eq!(qt.version, "6.4.2");
        assert_eq!(qt.prefix, PathBuf::from("/usr"));
        assert_eq!(qt.qmake, PathBuf::from("/usr/bin/qmake6"));
    }

    #[test]
    fn requirements_scope_external_frameworks_only() {
        let mut needs = FrameworkNeeds::default();
        needs.include(&Requirements {
            node: true,
            rust: true,
            python: false,
            cmake: false,
            qt: false,
        });
        assert_eq!(
            needs,
            FrameworkNeeds {
                node: true,
                python: false,
                cmake: false,
                qt: false,
            }
        );
    }

    #[test]
    fn qt_requirement_also_requires_cmake() {
        let mut needs = FrameworkNeeds::default();
        needs.include(&Requirements {
            node: false,
            rust: true,
            python: false,
            cmake: false,
            qt: true,
        });
        assert!(needs.cmake);
        assert!(needs.qt);
    }

    #[test]
    fn cmake_arguments_are_offline_and_include_qt_prefix() {
        let args = cmake_configure_args(
            Path::new("source"),
            Path::new("build-xtask-check"),
            Some(Path::new("/opt/Qt/6.8.0/gcc_64")),
        )
        .into_iter()
        .map(|value| value.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
        assert!(args.contains(&"-DCMAKE_PREFIX_PATH=/opt/Qt/6.8.0/gcc_64".to_string()));
    }

    #[test]
    fn syntax_command_arguments_are_non_emitting_and_scoped() {
        assert_eq!(
            typescript_args(Path::new("component/tsconfig.json")),
            [
                "--no-install",
                "tsc",
                "--noEmit",
                "-p",
                "component/tsconfig.json"
            ]
            .into_iter()
            .map(OsString::from)
            .collect::<Vec<_>>()
        );
        assert_eq!(
            cargo_check_args(Path::new("component/Cargo.toml")),
            ["check", "--manifest-path", "component/Cargo.toml"]
                .into_iter()
                .map(OsString::from)
                .collect::<Vec<_>>()
        );
        assert_eq!(
            python_compile_args(&[PathBuf::from("src"), PathBuf::from("scripts")]),
            ["-m", "compileall", "-q", "-f", "src", "scripts"]
                .into_iter()
                .map(OsString::from)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn pnpm_is_not_part_of_required_node_readiness() {
        let tools = Toolchain {
            os: HostOs::Linux,
            node: Some(PathBuf::from("node")),
            npm: Some(PathBuf::from("npm")),
            npx: Some(PathBuf::from("npx")),
            pnpm: None,
            python: None,
            cmake: None,
            qt: None,
        };
        let missing = tools.missing_for(&Requirements {
            node: true,
            rust: false,
            python: false,
            cmake: false,
            qt: false,
        });
        assert!(missing.is_empty());
    }

    #[test]
    fn whisper_preflight_reports_every_missing_offline_input() {
        let temp = tempdir().expect("tempdir");
        let error = preflight_whisper(temp.path(), &temp.path().join("build-xtask-check"))
            .expect_err("missing preflight inputs");
        assert!(error.contains("whisper_cpp-src"));
        assert!(error.contains("json-src"));
        assert!(error.contains("miniaudio.h"));
        assert!(error.contains("ggml-tiny.en.bin"));
    }
}
