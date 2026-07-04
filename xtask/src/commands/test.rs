use crate::components::{TestBackend, TestInventory, TestSelection};
use crate::registry::manifest::Operation;
use crate::registry::{Component, Registry};
use crate::{components, Runtime};
use std::collections::HashSet;
use std::io::{self, Write};

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if registry.is_repository() {
        if !args.is_empty() {
            return super::fail(
                runtime,
                "repository test does not accept numbered selectors without a component path.",
            );
        }
        return run_repository(runtime, registry);
    }

    let component = match super::component_operation(runtime, registry, Operation::Test) {
        Ok(component) => component,
        Err(code) => return code,
    };
    let component_backend = backend(component);
    if component_backend == TestBackend::LiveOnly {
        if !args.is_empty() {
            return super::fail(
                runtime,
                "This component has no numbered ordinary tests; use the live command instead.",
            );
        }
        runtime.heading(&format!("{} Test", component.display_name()));
        return run_component_tests(
            runtime,
            component,
            &TestSelection {
                inline: false,
                targets: Vec::new(),
            },
        );
    }

    let inventory = match discover(component) {
        Ok(inventory) => inventory,
        Err(error) => return super::fail(runtime, &error),
    };
    if !inventory.inline && inventory.targets.is_empty() {
        runtime.note("Nothing here yet.");
        return 0;
    }
    let parsed = match select_tests(&inventory, args) {
        Ok(selection) => selection,
        Err(error) => return super::fail(runtime, &error),
    };

    print_test_inventory(runtime, component, &inventory, true);
    if parsed.selection.is_empty() {
        runtime.note("Nothing here yet.");
        return 0;
    }
    if args.is_empty() {
        match confirm_default_yes(runtime, "Run all tests listed above? [Y/n]") {
            Ok(true) => {}
            Ok(false) => {
                runtime.note("Test cancelled.");
                return 0;
            }
            Err(error) => {
                return super::fail(runtime, &format!("Could not read confirmation: {error}"))
            }
        }
    }
    print_running(runtime, &parsed.label);
    run_component_tests(runtime, component, &parsed.selection)
}

fn run_repository(runtime: &Runtime, registry: &Registry) -> i32 {
    let mut succeeded = 0;
    let mut failed = 0;
    let mut found_any = false;

    for component in registry.targets_for(Operation::Test) {
        if backend(component) == TestBackend::LiveOnly {
            runtime.heading(&format!("{} Test", component.display_name()));
            let selection = TestSelection {
                inline: false,
                targets: Vec::new(),
            };
            if let Err(error) = components::test(runtime, component, &selection) {
                failed += 1;
                runtime.error(&format!("{}: {error}", component.name()));
            }
            continue;
        }

        let inventory = match discover(component) {
            Ok(inventory) => inventory,
            Err(error) => {
                failed += 1;
                runtime.error(&format!("{}: {error}", component.name()));
                continue;
            }
        };
        let parsed = select_tests(&inventory, &[]).expect("bare selection is always valid");
        if parsed.selection.is_empty() {
            continue;
        }

        found_any = true;
        print_test_inventory(runtime, component, &inventory, false);
        print_running(runtime, &parsed.label);
        match components::test(runtime, component, &parsed.selection) {
            Ok(()) => succeeded += 1,
            Err(error) => {
                failed += 1;
                runtime.error(&format!("{}: {error}", component.name()));
            }
        }
    }
    if !found_any && failed == 0 {
        runtime.note("Nothing here yet.");
    }
    super::print_summary("Test", succeeded, failed);
    i32::from(failed > 0)
}

fn run_component_tests(runtime: &Runtime, component: &Component, selection: &TestSelection) -> i32 {
    match components::test(runtime, component, selection) {
        Ok(()) => 0,
        Err(error) => super::fail(runtime, &error),
    }
}

struct ParsedSelection {
    selection: TestSelection,
    label: String,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
enum TestSelector {
    Inline,
    File(usize),
}

impl TestSelector {
    fn label(self) -> String {
        match self {
            Self::Inline => "i".to_string(),
            Self::File(number) => number.to_string(),
        }
    }
}

fn select_tests(inventory: &TestInventory, args: &[String]) -> Result<ParsedSelection, String> {
    if args.is_empty() {
        return Ok(ParsedSelection {
            selection: TestSelection {
                inline: inventory.inline,
                targets: inventory.targets.clone(),
            },
            label: "all tests".to_string(),
        });
    }

    let (skip, values) = if args.first().is_some_and(|value| value == "--skip") {
        if args.len() == 1 {
            return Err("--skip requires at least one test number.".to_string());
        }
        (true, &args[1..])
    } else {
        if args.iter().any(|value| value.starts_with('-')) {
            return Err("test accepts only numbers or --skip followed by numbers.".to_string());
        }
        (false, args)
    };
    let selectors = parse_selectors(values, inventory.targets.len(), inventory.inline)?;
    let selector_set = selectors.iter().copied().collect::<HashSet<_>>();
    let selection = if skip {
        TestSelection {
            inline: inventory.inline && !selector_set.contains(&TestSelector::Inline),
            targets: inventory
                .targets
                .iter()
                .enumerate()
                .filter(|(index, _)| !selector_set.contains(&TestSelector::File(index + 1)))
                .map(|(_, target)| target.clone())
                .collect(),
        }
    } else {
        TestSelection {
            inline: selector_set.contains(&TestSelector::Inline),
            targets: selectors
                .iter()
                .filter_map(|selector| match selector {
                    TestSelector::Inline => None,
                    TestSelector::File(number) => Some(inventory.targets[*number - 1].clone()),
                })
                .collect(),
        }
    };
    let joined = selectors
        .iter()
        .map(|selector| selector.label())
        .collect::<Vec<_>>()
        .join(", ");
    Ok(ParsedSelection {
        selection,
        label: if skip {
            format!("all tests except {joined}")
        } else {
            format!("tests {joined}")
        },
    })
}

fn parse_selectors(
    values: &[String],
    count: usize,
    inline: bool,
) -> Result<Vec<TestSelector>, String> {
    let mut seen = HashSet::new();
    let mut selectors = Vec::new();
    for value in values {
        let selector = if value == "i" {
            if !inline {
                return Err("Inline selector 'i' is not available for this component.".to_string());
            }
            TestSelector::Inline
        } else {
            let number = value.parse::<usize>().map_err(|_| {
                format!("Test selector '{value}' must be 'i' or a positive test number.")
            })?;
            if number == 0 {
                return Err("Test numbers start at 1; use 'i' for inline tests.".to_string());
            }
            if number > count {
                return Err(format!(
                    "Test number {number} is out of range; this component has {count} numbered tests."
                ));
            }
            TestSelector::File(number)
        };
        if !seen.insert(selector) {
            return Err(match selector {
                TestSelector::Inline => {
                    "Inline selector 'i' was supplied more than once.".to_string()
                }
                TestSelector::File(number) => {
                    format!("Test number {number} was supplied more than once.")
                }
            });
        }
        selectors.push(selector);
    }
    Ok(selectors)
}

fn print_test_inventory(
    runtime: &Runtime,
    component: &Component,
    inventory: &TestInventory,
    show_tip: bool,
) {
    runtime.heading(&format!("{} Test", component.display_name()));
    println!("\nTests found:");
    if inventory.inline {
        println!("  i  inline/unit tests");
    }
    for (index, test) in inventory.targets.iter().enumerate() {
        println!("  {}  {}", index + 1, test.path.display());
    }
    if !inventory.inline && inventory.targets.is_empty() {
        println!("  none");
    }
    if show_tip {
        let select_example = match (inventory.inline, inventory.targets.len()) {
            (true, 0) => "i".to_string(),
            (true, _) => "i 1".to_string(),
            (false, 1) => "1".to_string(),
            (false, _) => "1 2".to_string(),
        };
        let skip_example = if inventory.targets.is_empty() {
            "i"
        } else {
            "1"
        };
        println!(
            "\nTip: select tests with `cargo xtask test {select_example}`, or exclude them with `cargo xtask test --skip {skip_example}`."
        );
    }
}

fn print_running(runtime: &Runtime, label: &str) {
    println!(
        "\nRunning:\n  {label:<24} {}",
        runtime.console.green("ready")
    );
}

fn confirm_default_yes(runtime: &Runtime, prompt: &str) -> io::Result<bool> {
    loop {
        print!("{} ", runtime.console.yellow(prompt));
        io::stdout().flush()?;
        let mut input = String::new();
        let bytes = io::stdin().read_line(&mut input)?;
        if bytes == 0 {
            return Ok(true);
        }
        if let Some(answer) = parse_confirmation(&input) {
            return Ok(answer);
        }
        runtime.note("Please answer y or n.");
    }
}

fn parse_confirmation(value: &str) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "" | "y" | "yes" => Some(true),
        "n" | "no" => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::components::TestTarget;
    use std::path::PathBuf;

    fn inventory(count: usize) -> TestInventory {
        TestInventory {
            inline: true,
            targets: (1..=count)
                .map(|number| TestTarget {
                    path: PathBuf::from(format!("tests/test_{number}.rs")),
                    runner_name: Some(format!("test_{number}")),
                })
                .collect(),
        }
    }

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn bare_selection_includes_inline_and_all_files() {
        let selected = select_tests(&inventory(3), &[]).expect("select all");
        assert!(selected.selection.inline);
        assert_eq!(selected.selection.targets.len(), 3);
        assert_eq!(selected.label, "all tests");
    }

    #[test]
    fn inline_selector_combines_with_numbered_files() {
        let selected =
            select_tests(&inventory(3), &args(&["i", "1", "3"])).expect("combined selection");
        assert!(selected.selection.inline);
        assert_eq!(
            selected
                .selection
                .targets
                .iter()
                .map(|target| target.path.clone())
                .collect::<Vec<_>>(),
            vec![
                PathBuf::from("tests/test_1.rs"),
                PathBuf::from("tests/test_3.rs")
            ]
        );
    }

    #[test]
    fn skip_uses_inline_and_files_as_its_baseline() {
        let selected =
            select_tests(&inventory(3), &args(&["--skip", "i", "2"])).expect("skip selection");
        assert!(!selected.selection.inline);
        assert_eq!(selected.selection.targets.len(), 2);
        assert_eq!(
            selected.selection.targets[0].path,
            PathBuf::from("tests/test_1.rs")
        );
        assert_eq!(
            selected.selection.targets[1].path,
            PathBuf::from("tests/test_3.rs")
        );
    }

    #[test]
    fn skipping_every_entry_produces_an_empty_selection() {
        let selected =
            select_tests(&inventory(2), &args(&["--skip", "i", "1", "2"])).expect("skip all");
        assert!(selected.selection.is_empty());
    }

    #[test]
    fn selectors_reject_duplicates_and_out_of_range_values() {
        let duplicate = select_tests(&inventory(2), &args(&["1", "1"]))
            .err()
            .expect("duplicate error");
        assert!(duplicate.contains("more than once"));

        let out_of_range = select_tests(&inventory(2), &args(&["3"]))
            .err()
            .expect("range error");
        assert!(out_of_range.contains("out of range"));
    }

    #[test]
    fn inline_selector_requires_an_inline_backend() {
        let inventory = TestInventory {
            inline: false,
            targets: Vec::new(),
        };
        let error = select_tests(&inventory, &args(&["i"]))
            .err()
            .expect("inline error");
        assert!(error.contains("not available"));
    }

    #[test]
    fn zero_is_not_an_alias_for_inline_tests() {
        let error = select_tests(&inventory(2), &args(&["0"]))
            .err()
            .expect("zero error");
        assert!(error.contains("use 'i' for inline tests"));
    }

    #[test]
    fn confirmation_is_default_yes() {
        assert_eq!(parse_confirmation("\n"), Some(true));
        assert_eq!(parse_confirmation("YES"), Some(true));
        assert_eq!(parse_confirmation("n"), Some(false));
        assert_eq!(parse_confirmation("maybe"), None);
    }
}

pub(crate) use runner::{backend, discover, report_live_only, run_cargo, run_node};

mod runner {
    use crate::components::{TestBackend, TestInventory, TestSelection, TestTarget};
    use crate::registry::manifest::Category;
    use crate::registry::Component;
    use crate::{Runtime, XtaskResult};
    use globset::{Glob, GlobSet, GlobSetBuilder};
    use serde::Deserialize;
    use std::collections::BTreeMap;
    use std::ffi::OsString;
    use std::fs;
    use std::io::{self, Read, Write};
    use std::path::{Path, PathBuf};
    use std::process::{Child, Command, Stdio};
    use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
    use std::thread;
    use std::time::{Duration, Instant};

    const TEST_IDLE_TIMEOUT: Duration = Duration::from_secs(10);
    const NODE_INLINE_GLOBS: [&str; 2] = ["src/**/*.test.ts", "src/**/*.test.tsx"];

    pub fn backend(component: &Component) -> TestBackend {
        match component.category() {
            Category::Apps | Category::Packages => TestBackend::Node,
            Category::Crates => TestBackend::Cargo,
            Category::Sidecars
                if component.manifest.requirements.rust
                    && component.directory.join("Cargo.toml").is_file() =>
            {
                TestBackend::Cargo
            }
            Category::Sidecars => TestBackend::LiveOnly,
        }
    }

    pub fn discover(component: &Component) -> XtaskResult<TestInventory> {
        let candidates = discover_matching_files(
            &component.directory,
            Path::new(&component.manifest.tests.root),
            &component.manifest.tests.include,
        )?;

        match backend(component) {
            TestBackend::Node => Ok(TestInventory {
                inline: true,
                targets: candidates
                    .into_iter()
                    .map(|path| TestTarget {
                        path,
                        runner_name: None,
                    })
                    .collect(),
            }),
            TestBackend::Cargo => {
                let cargo = cargo_info(component)?;
                let targets = candidates
                    .into_iter()
                    .filter_map(|path| {
                        cargo.integration.get(&path).map(|name| TestTarget {
                            path,
                            runner_name: Some(name.clone()),
                        })
                    })
                    .collect();
                Ok(TestInventory {
                    inline: cargo.has_inline_targets(),
                    targets,
                })
            }
            TestBackend::LiveOnly => Ok(TestInventory {
                inline: false,
                targets: Vec::new(),
            }),
        }
    }

    pub fn run_node(
        runtime: &Runtime,
        component: &Component,
        selection: &TestSelection,
    ) -> XtaskResult {
        let mut command = Command::new("node");
        command
            .args(node_test_args(selection))
            .current_dir(&component.directory);
        run_monitored(&mut command, MonitorStart::Immediate, TEST_IDLE_TIMEOUT)?;
        runtime.success(&format!("{} tests passed.", component.display_name()));
        Ok(())
    }

    pub fn run_cargo(
        runtime: &Runtime,
        component: &Component,
        selection: &TestSelection,
    ) -> XtaskResult {
        let cargo = cargo_info(component)?;
        let args = cargo_test_args(&component.directory.join("Cargo.toml"), &cargo, selection)?;
        if args.is_empty() {
            runtime.note("Nothing here yet.");
            return Ok(());
        }

        let mut command = Command::new("cargo");
        command.args(args).current_dir(&component.directory);
        run_monitored(&mut command, MonitorStart::CargoTests, TEST_IDLE_TIMEOUT)?;
        runtime.success(&format!("{} tests passed.", component.display_name()));
        Ok(())
    }

    pub fn report_live_only(runtime: &Runtime, component: &Component) {
        let destination = match component
            .operation(crate::registry::manifest::Operation::Test)
            .handler
            .as_str()
        {
            "paddle-ocr" => "`cargo xtask live ocr`",
            _ => "the `cargo xtask live` command",
        };
        runtime.note(&format!(
            "Interactive {} tests belong under {destination}; no ordinary tests were run.",
            component.display_name()
        ));
    }

    fn discover_matching_files(
        component_root: &Path,
        tests_root: &Path,
        patterns: &[String],
    ) -> XtaskResult<Vec<PathBuf>> {
        let matcher = build_matcher(patterns)?;
        let root = component_root.join(tests_root);
        if !root.exists() {
            return Ok(Vec::new());
        }
        if !root.is_dir() {
            return Err(format!(
                "Configured test root is not a directory: {}",
                root.display()
            ));
        }

        let mut matches = Vec::new();
        walk_test_files(component_root, &root, &matcher, &mut matches)?;
        matches.sort();
        Ok(matches)
    }

    fn build_matcher(patterns: &[String]) -> XtaskResult<GlobSet> {
        let mut builder = GlobSetBuilder::new();
        for pattern in patterns {
            builder.add(
                Glob::new(pattern).map_err(|error| {
                    format!("Invalid test include pattern '{pattern}': {error}")
                })?,
            );
        }
        builder
            .build()
            .map_err(|error| format!("Could not build test include patterns: {error}"))
    }

    fn walk_test_files(
        component_root: &Path,
        directory: &Path,
        matcher: &GlobSet,
        matches: &mut Vec<PathBuf>,
    ) -> XtaskResult {
        let entries = fs::read_dir(directory).map_err(|error| {
            format!(
                "Could not read test directory {}: {error}",
                directory.display()
            )
        })?;
        for entry in entries {
            let entry = entry.map_err(|error| {
                format!(
                    "Could not read an entry in {}: {error}",
                    directory.display()
                )
            })?;
            let file_type = entry.file_type().map_err(|error| {
                format!(
                    "Could not inspect test path {}: {error}",
                    entry.path().display()
                )
            })?;
            if file_type.is_dir() {
                walk_test_files(component_root, &entry.path(), matcher, matches)?;
            } else if file_type.is_file() {
                let path = entry.path();
                let relative = path.strip_prefix(component_root).map_err(|_| {
                    format!(
                        "Discovered test path escaped its component: {}",
                        path.display()
                    )
                })?;
                if matcher.is_match(relative) {
                    matches.push(relative.to_path_buf());
                }
            }
        }
        Ok(())
    }

    #[derive(Debug)]
    struct CargoInfo {
        has_library: bool,
        bins: Vec<String>,
        integration: BTreeMap<PathBuf, String>,
    }

    impl CargoInfo {
        fn has_inline_targets(&self) -> bool {
            self.has_library || !self.bins.is_empty()
        }
    }

    #[derive(Deserialize)]
    struct CargoMetadata {
        packages: Vec<CargoPackage>,
    }

    #[derive(Deserialize)]
    struct CargoPackage {
        manifest_path: PathBuf,
        targets: Vec<CargoTarget>,
    }

    #[derive(Deserialize)]
    struct CargoTarget {
        name: String,
        kind: Vec<String>,
        src_path: PathBuf,
        test: bool,
    }

    fn cargo_info(component: &Component) -> XtaskResult<CargoInfo> {
        let manifest = component.directory.join("Cargo.toml");
        let output = Command::new("cargo")
            .args([
                "metadata",
                "--format-version",
                "1",
                "--no-deps",
                "--manifest-path",
            ])
            .arg(&manifest)
            .current_dir(&component.directory)
            .stdin(Stdio::null())
            .output()
            .map_err(|error| format!("Could not inspect Cargo test targets: {error}"))?;
        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr);
            return Err(format!(
                "Cargo test-target discovery failed: {}",
                detail.trim()
            ));
        }
        parse_cargo_metadata(&output.stdout, &manifest, &component.directory)
    }

    fn parse_cargo_metadata(
        body: &[u8],
        manifest: &Path,
        component_root: &Path,
    ) -> XtaskResult<CargoInfo> {
        let metadata: CargoMetadata = serde_json::from_slice(body)
            .map_err(|error| format!("Could not parse Cargo metadata: {error}"))?;
        let expected_manifest = manifest
            .canonicalize()
            .unwrap_or_else(|_| manifest.to_path_buf());
        let package = metadata
            .packages
            .into_iter()
            .find(|package| {
                package
                    .manifest_path
                    .canonicalize()
                    .unwrap_or_else(|_| package.manifest_path.clone())
                    == expected_manifest
            })
            .ok_or_else(|| format!("Cargo metadata did not include {}", manifest.display()))?;

        let canonical_root = component_root
            .canonicalize()
            .unwrap_or_else(|_| component_root.to_path_buf());
        let mut has_library = false;
        let mut bins = Vec::new();
        let mut integration = BTreeMap::new();
        for target in package.targets {
            if !target.test {
                continue;
            }
            if target.kind.iter().any(|kind| kind == "test") {
                let source = target
                    .src_path
                    .canonicalize()
                    .unwrap_or(target.src_path.clone());
                if let Ok(relative) = source.strip_prefix(&canonical_root) {
                    integration.insert(relative.to_path_buf(), target.name);
                }
            } else if target.kind.iter().any(|kind| kind == "bin") {
                bins.push(target.name);
            } else if target.kind.iter().any(|kind| {
                matches!(
                    kind.as_str(),
                    "lib" | "rlib" | "dylib" | "cdylib" | "staticlib" | "proc-macro"
                )
            }) {
                has_library = true;
            }
        }
        bins.sort();
        Ok(CargoInfo {
            has_library,
            bins,
            integration,
        })
    }

    fn cargo_test_args(
        manifest: &Path,
        cargo: &CargoInfo,
        selection: &TestSelection,
    ) -> XtaskResult<Vec<OsString>> {
        let mut args = vec![
            OsString::from("test"),
            OsString::from("--manifest-path"),
            manifest.as_os_str().to_os_string(),
            OsString::from("--no-fail-fast"),
        ];
        let mut selected_any = false;
        if selection.inline {
            if cargo.has_library {
                args.push(OsString::from("--lib"));
                selected_any = true;
            }
            for bin in &cargo.bins {
                args.push(OsString::from("--bin"));
                args.push(OsString::from(bin));
                selected_any = true;
            }
        }
        for target in &selection.targets {
            let runner_name = target.runner_name.as_ref().ok_or_else(|| {
                format!(
                    "Rust test target {} has no Cargo target name",
                    target.path.display()
                )
            })?;
            args.push(OsString::from("--test"));
            args.push(OsString::from(runner_name));
            selected_any = true;
        }
        if selected_any {
            Ok(args)
        } else {
            Ok(Vec::new())
        }
    }

    fn node_test_args(selection: &TestSelection) -> Vec<OsString> {
        let mut args = vec![
            OsString::from("--import"),
            OsString::from("tsx"),
            OsString::from("--test"),
        ];
        if selection.inline {
            args.extend(NODE_INLINE_GLOBS.into_iter().map(OsString::from));
        }
        args.extend(
            selection
                .targets
                .iter()
                .map(|target| target.path.clone().into_os_string()),
        );
        args
    }

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    enum MonitorStart {
        Immediate,
        CargoTests,
    }

    #[derive(Clone, Copy)]
    enum OutputStream {
        Stdout,
        Stderr,
    }

    enum OutputEvent {
        Data(OutputStream, Vec<u8>),
        Eof,
        Error(String),
    }

    fn run_monitored(
        command: &mut Command,
        start: MonitorStart,
        idle_timeout: Duration,
    ) -> XtaskResult {
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        configure_process_group(command);
        let mut child = command
            .spawn()
            .map_err(|error| format!("Could not start test command: {error}"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Could not capture test stdout.".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Could not capture test stderr.".to_string())?;
        let (sender, receiver) = mpsc::channel();
        spawn_output_reader(stdout, OutputStream::Stdout, sender.clone());
        spawn_output_reader(stderr, OutputStream::Stderr, sender);

        monitor_child(&mut child, receiver, start, idle_timeout)
    }

    fn spawn_output_reader<R: Read + Send + 'static>(
        mut reader: R,
        stream: OutputStream,
        sender: Sender<OutputEvent>,
    ) {
        thread::spawn(move || {
            let mut buffer = [0_u8; 4096];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => {
                        let _ = sender.send(OutputEvent::Eof);
                        break;
                    }
                    Ok(count) => {
                        if sender
                            .send(OutputEvent::Data(stream, buffer[..count].to_vec()))
                            .is_err()
                        {
                            break;
                        }
                    }
                    Err(error) => {
                        let _ = sender.send(OutputEvent::Error(error.to_string()));
                        break;
                    }
                }
            }
        });
    }

    fn monitor_child(
        child: &mut Child,
        receiver: Receiver<OutputEvent>,
        start: MonitorStart,
        idle_timeout: Duration,
    ) -> XtaskResult {
        let mut active = start == MonitorStart::Immediate;
        let mut last_activity = Instant::now();
        let mut cargo_probe = Vec::new();
        let mut closed_streams = 0;

        while closed_streams < 2 {
            let event = if active {
                let remaining = idle_timeout.saturating_sub(last_activity.elapsed());
                if remaining.is_zero() {
                    terminate_process_tree(child);
                    return Err(format!(
                        "Timed out after {} seconds without test output.",
                        idle_timeout.as_secs()
                    ));
                }
                match receiver.recv_timeout(remaining) {
                    Ok(event) => event,
                    Err(RecvTimeoutError::Timeout) => {
                        terminate_process_tree(child);
                        return Err(format!(
                            "Timed out after {} seconds without test output.",
                            idle_timeout.as_secs()
                        ));
                    }
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            } else {
                match receiver.recv() {
                    Ok(event) => event,
                    Err(_) => break,
                }
            };

            match event {
                OutputEvent::Data(stream, bytes) => {
                    forward_output(stream, &bytes)?;
                    if !active && start == MonitorStart::CargoTests {
                        cargo_probe.extend_from_slice(&bytes);
                        active = cargo_output_started_tests(&cargo_probe);
                        if cargo_probe.len() > 512 {
                            let keep_from = cargo_probe.len() - 256;
                            cargo_probe.drain(..keep_from);
                        }
                    }
                    if active {
                        last_activity = Instant::now();
                    }
                }
                OutputEvent::Eof => closed_streams += 1,
                OutputEvent::Error(error) => {
                    terminate_process_tree(child);
                    return Err(format!("Could not read test output: {error}"));
                }
            }
        }

        let status = child
            .wait()
            .map_err(|error| format!("Could not wait for test command: {error}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("Test command exited with status {status}."))
        }
    }

    fn cargo_output_started_tests(output: &[u8]) -> bool {
        String::from_utf8_lossy(output).contains("Running ")
    }

    fn forward_output(stream: OutputStream, bytes: &[u8]) -> XtaskResult {
        match stream {
            OutputStream::Stdout => {
                let mut output = io::stdout().lock();
                output
                    .write_all(bytes)
                    .and_then(|_| output.flush())
                    .map_err(|error| format!("Could not stream test stdout: {error}"))
            }
            OutputStream::Stderr => {
                let mut output = io::stderr().lock();
                output
                    .write_all(bytes)
                    .and_then(|_| output.flush())
                    .map_err(|error| format!("Could not stream test stderr: {error}"))
            }
        }
    }

    #[cfg(unix)]
    fn configure_process_group(command: &mut Command) {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }

    #[cfg(not(unix))]
    fn configure_process_group(_command: &mut Command) {}

    fn terminate_process_tree(child: &mut Child) {
        #[cfg(unix)]
        unsafe {
            libc::kill(-(child.id() as i32), libc::SIGKILL);
        }
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .args(["/PID", &child.id().to_string(), "/T", "/F"])
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
        let _ = child.kill();
        let _ = child.wait();
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use serde_json::json;
        use std::env;
        use tempfile::tempdir;

        #[test]
        fn discovers_matching_regular_files_in_stable_order() {
            let temp = tempdir().expect("tempdir");
            fs::create_dir_all(temp.path().join("tests/nested")).expect("create tests");
            fs::write(temp.path().join("tests/z.test.ts"), "").expect("write z");
            fs::write(temp.path().join("tests/a.test.ts"), "").expect("write a");
            fs::write(temp.path().join("tests/nested/b.test.ts"), "").expect("write nested");
            fs::write(temp.path().join("tests/ignored.ts"), "").expect("write ignored");

            let files = discover_matching_files(
                temp.path(),
                Path::new("tests"),
                &[
                    "tests/*.test.ts".to_string(),
                    "tests/**/*.test.ts".to_string(),
                ],
            )
            .expect("discover tests");

            assert_eq!(
                files,
                vec![
                    PathBuf::from("tests/a.test.ts"),
                    PathBuf::from("tests/nested/b.test.ts"),
                    PathBuf::from("tests/z.test.ts"),
                ]
            );
        }

        #[test]
        fn missing_test_root_is_empty() {
            let temp = tempdir().expect("tempdir");
            let files = discover_matching_files(
                temp.path(),
                Path::new("tests"),
                &["tests/*.rs".to_string()],
            )
            .expect("missing root");
            assert!(files.is_empty());
        }

        #[test]
        fn node_inline_globs_never_include_numbered_test_root() {
            let selection = TestSelection {
                inline: true,
                targets: vec![TestTarget {
                    path: PathBuf::from("tests/selected.test.ts"),
                    runner_name: None,
                }],
            };
            let args = node_test_args(&selection)
                .into_iter()
                .map(|value| value.to_string_lossy().into_owned())
                .collect::<Vec<_>>();
            assert!(args.contains(&"src/**/*.test.ts".to_string()));
            assert!(args.contains(&"src/**/*.test.tsx".to_string()));
            assert!(args.contains(&"tests/selected.test.ts".to_string()));
            assert!(!args.contains(&"tests/**/*.test.ts".to_string()));
        }

        #[test]
        fn cargo_metadata_only_exposes_real_test_targets() {
            let temp = tempdir().expect("tempdir");
            let manifest = temp.path().join("Cargo.toml");
            let lib = temp.path().join("src/lib.rs");
            let integration = temp.path().join("tests/flow.rs");
            let helper = temp.path().join("tests/support/helper.rs");
            fs::create_dir_all(lib.parent().expect("lib parent")).expect("create src");
            fs::create_dir_all(helper.parent().expect("helper parent")).expect("create tests");
            fs::write(&manifest, "[package]\nname='fixture'\nversion='0.1.0'").expect("manifest");
            fs::write(&lib, "").expect("lib");
            fs::write(&integration, "").expect("integration");
            fs::write(&helper, "").expect("helper");
            let metadata = json!({
                "packages": [{
                    "manifest_path": manifest,
                    "targets": [
                        {"name": "fixture", "kind": ["lib"], "src_path": lib, "test": true},
                        {"name": "flow", "kind": ["test"], "src_path": integration, "test": true}
                    ]
                }]
            });

            let info = parse_cargo_metadata(
                serde_json::to_vec(&metadata)
                    .expect("metadata json")
                    .as_slice(),
                &temp.path().join("Cargo.toml"),
                temp.path(),
            )
            .expect("parse metadata");

            assert!(info.has_library);
            assert_eq!(info.integration.len(), 1);
            assert_eq!(
                info.integration.get(Path::new("tests/flow.rs")),
                Some(&"flow".to_string())
            );
            assert!(!info
                .integration
                .contains_key(Path::new("tests/support/helper.rs")));
        }

        #[test]
        fn cargo_arguments_combine_inline_and_selected_integration_targets() {
            let cargo = CargoInfo {
                has_library: true,
                bins: vec!["fixture-cli".to_string()],
                integration: BTreeMap::new(),
            };
            let selection = TestSelection {
                inline: true,
                targets: vec![TestTarget {
                    path: PathBuf::from("tests/flow.rs"),
                    runner_name: Some("flow".to_string()),
                }],
            };
            let args = cargo_test_args(Path::new("Cargo.toml"), &cargo, &selection)
                .expect("cargo arguments")
                .into_iter()
                .map(|value| value.to_string_lossy().into_owned())
                .collect::<Vec<_>>();

            assert!(args.windows(1).any(|pair| pair == ["--lib"]));
            assert!(args.windows(2).any(|pair| pair == ["--bin", "fixture-cli"]));
            assert!(args.windows(2).any(|pair| pair == ["--test", "flow"]));
            assert!(args.contains(&"--no-fail-fast".to_string()));
        }

        #[test]
        fn cargo_test_marker_is_detected_across_chunks() {
            let mut output = b"Finished test profile".to_vec();
            assert!(!cargo_output_started_tests(&output));
            output.extend_from_slice(b"\n     Run");
            assert!(!cargo_output_started_tests(&output));
            output.extend_from_slice(b"ning unittests src/lib.rs");
            assert!(cargo_output_started_tests(&output));
        }

        #[test]
        fn silent_test_process_hits_the_inactivity_timeout() {
            let mut command = watchdog_child("silent");
            let error = run_monitored(
                &mut command,
                MonitorStart::Immediate,
                Duration::from_millis(75),
            )
            .expect_err("silent child should time out");
            assert!(error.contains("without test output"));
        }

        #[test]
        fn streamed_output_resets_the_inactivity_timeout() {
            let mut command = watchdog_child("stream");
            run_monitored(
                &mut command,
                MonitorStart::Immediate,
                Duration::from_millis(75),
            )
            .expect("streaming child should finish");
        }

        #[test]
        fn cargo_compilation_phase_is_not_timed() {
            let mut command = watchdog_child("short-silent");
            run_monitored(
                &mut command,
                MonitorStart::CargoTests,
                Duration::from_millis(25),
            )
            .expect("pre-test silence should not time out");
        }

        fn watchdog_child(mode: &str) -> Command {
            let mut command = Command::new(env::current_exe().expect("current test executable"));
            command
                .args([
                    "--exact",
                    "commands::test::runner::tests::watchdog_child_process",
                    "--nocapture",
                ])
                .env("SQUIGIT_WATCHDOG_CHILD", mode);
            command
        }

        #[test]
        fn watchdog_child_process() {
            let Ok(mode) = env::var("SQUIGIT_WATCHDOG_CHILD") else {
                return;
            };
            match mode.as_str() {
                "silent" => thread::sleep(Duration::from_millis(250)),
                "short-silent" => thread::sleep(Duration::from_millis(100)),
                "stream" => {
                    for _ in 0..8 {
                        println!("watchdog activity");
                        io::stdout().flush().expect("flush activity");
                        thread::sleep(Duration::from_millis(30));
                    }
                }
                other => panic!("unknown watchdog mode {other}"),
            }
        }
    }
}
