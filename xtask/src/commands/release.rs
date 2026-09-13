// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::args::{ReleaseArgs, ReleaseTarget};
use crate::process;
use crate::registry::{PackageState, Registry};
use crate::workspace::{self, PackageId, LIBRARY_IDS};
use semver::Version;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{self, IsTerminal, Write};
use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

const DISTRIBUTION_REPOSITORY: &str = "squigit-org/distribution";
const CRATE_SIZE_LIMIT: u64 = 10 * 1024 * 1024;

struct GitContext {
    sha: String,
}

struct CrateRelease {
    id: PackageId,
    local: Version,
    state: PackageState,
    pending: bool,
}

struct ProductRelease {
    label: &'static str,
    version: Version,
    latest: Option<Version>,
    tag: String,
    workflow: &'static str,
    source_tag_exists: bool,
}

pub fn run(arguments: ReleaseArgs) -> Result<(), String> {
    let root = process::workspace_root()?;
    let git = guard_git(&root)?;
    println!("[release] repository doctor");
    super::doctor::run()?;
    println!("[release] Rust tests");
    super::test::run(&[])?;

    match arguments.target {
        ReleaseTarget::Facade => release_facade(&root, &git, arguments.dry_run, arguments.yes),
        ReleaseTarget::Ocr => release_product(
            &root,
            &git,
            ReleaseTarget::Ocr,
            arguments.dry_run,
            arguments.yes,
        ),
        ReleaseTarget::Cli => release_product(
            &root,
            &git,
            ReleaseTarget::Cli,
            arguments.dry_run,
            arguments.yes,
        ),
    }
}

fn guard_git(root: &Path) -> Result<GitContext, String> {
    let status = process::output(
        Command::new("git")
            .args(["status", "--porcelain=v1", "--untracked-files=all"])
            .current_dir(root),
        "git status",
    )?;
    if !status.is_empty() {
        return Err("release requires a clean worktree, including untracked files".to_string());
    }
    let branch = process::output(
        Command::new("git")
            .args(["branch", "--show-current"])
            .current_dir(root),
        "current branch lookup",
    )?;
    if branch != "main" {
        return Err(format!(
            "release requires branch main; current branch is {branch:?}"
        ));
    }
    process::run(
        Command::new("git")
            .args(["fetch", "--prune", "origin"])
            .current_dir(root),
        "git fetch origin",
    )?;
    let sha = process::output(
        Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(root),
        "local HEAD lookup",
    )?;
    let remote = process::output(
        Command::new("git")
            .args(["rev-parse", "origin/main"])
            .current_dir(root),
        "origin/main lookup",
    )?;
    if sha != remote {
        return Err(format!(
            "release requires HEAD to equal origin/main\n  HEAD:        {sha}\n  origin/main: {remote}"
        ));
    }
    Ok(GitContext { sha })
}

fn release_facade(root: &Path, git: &GitContext, dry_run: bool, yes: bool) -> Result<(), String> {
    let registry = Registry::new()?;
    let mut releases = Vec::new();
    for id in LIBRARY_IDS {
        let package = workspace::spec(id);
        let local = workspace::package_version(root, id)?;
        println!("[release] crates.io {} {}", package.name, local);
        let state = registry.package_state(package.name, &local)?;
        if let Some(latest) = &state.latest {
            if local < *latest {
                return Err(format!(
                    "local {} {} is older than crates.io {}",
                    package.name, local, latest
                ));
            }
        }
        let pending = state.exact.is_none();
        if pending {
            if state.latest.as_ref().is_some_and(|latest| local <= *latest) {
                return Err(format!(
                    "{} {} cannot be published because crates.io already has a newer or equal version",
                    package.name, local
                ));
            }
        } else {
            ensure_published_source_unchanged(root, &registry, id, &state)?;
        }
        releases.push(CrateRelease {
            id,
            local,
            state,
            pending,
        });
    }

    if !releases.iter().any(|release| release.pending) {
        return Err("the facade graph has no unpublished versions".to_string());
    }
    let implementation_pending = releases
        .iter()
        .any(|release| release.pending && release.id != PackageId::Squigit);
    let facade_pending = releases
        .iter()
        .any(|release| release.pending && release.id == PackageId::Squigit);
    if implementation_pending && !facade_pending {
        return Err(
            "implementation crates are pending, but squigit-rs was not bumped; run `cargo xtask bump --squigit <VERSION>`"
                .to_string(),
        );
    }

    validate_release_dependencies(root, &releases)?;
    for release in releases.iter().filter(|release| release.pending) {
        prepare_package(root, release)?;
    }
    if !dry_run {
        registry.validate_publish_token()?;
    }
    print_facade_plan(git, &releases);
    if dry_run {
        println!("\nDry run complete. No crates were published.");
        return Ok(());
    }
    if !confirm(yes)? {
        println!("Release cancelled.");
        return Ok(());
    }

    for release in releases.iter().filter(|release| release.pending) {
        let package = workspace::spec(release.id);
        println!("\n[release] verifying {} {}", package.name, release.local);
        process::run(
            Command::new("cargo")
                .args([
                    "publish",
                    "--dry-run",
                    "--locked",
                    "--package",
                    package.name,
                ])
                .current_dir(root),
            &format!(
                "cargo publish dry run for {} {}",
                package.name, release.local
            ),
        )?;

        println!("[release] publishing {} {}", package.name, release.local);
        let status = Command::new("cargo")
            .args(["publish", "--locked", "--package", package.name])
            .current_dir(root)
            .status()
            .map_err(|error| {
                format!(
                    "could not start cargo publish for {}: {error}",
                    package.name
                )
            })?;
        if !status.success()
            && registry
                .package_state(package.name, &release.local)?
                .exact
                .is_none()
        {
            return Err(format!(
                "cargo publish failed for {} {} with {status}",
                package.name, release.local
            ));
        }
        registry.wait_for_version(package.name, &release.local)?;
    }

    println!("\nFacade release complete:");
    for release in releases.iter().filter(|release| release.pending) {
        println!("  {} {}", workspace::spec(release.id).name, release.local);
    }
    Ok(())
}

fn ensure_published_source_unchanged(
    root: &Path,
    registry: &Registry,
    id: PackageId,
    state: &PackageState,
) -> Result<(), String> {
    let package = workspace::spec(id);
    let published = state
        .exact
        .as_ref()
        .ok_or_else(|| "published version is missing".to_string())?;
    let published_sha = registry.published_vcs_sha(published)?;
    let mut command = Command::new("git");
    command
        .args([
            "diff",
            "--quiet",
            &published_sha,
            "HEAD",
            "--",
            package.source_root,
        ])
        .current_dir(root);
    if id == PackageId::Ocr {
        command.arg(":(exclude)squigit-ocr/native/**");
    }
    let status = command.status().map_err(|error| {
        format!(
            "could not compare published source for {}: {error}",
            package.name
        )
    })?;
    match status.code() {
        Some(0) => Ok(()),
        Some(1) => Err(format!(
            "{} source changed since {} was published; bump its version before release",
            package.name, published.version
        )),
        _ => Err(format!(
            "git could not compare {} with published commit {}",
            package.name, published_sha
        )),
    }
}

fn validate_release_dependencies(root: &Path, releases: &[CrateRelease]) -> Result<(), String> {
    let by_id: HashMap<PackageId, &CrateRelease> = releases
        .iter()
        .map(|release| (release.id, release))
        .collect();
    for release in releases.iter().filter(|release| release.pending) {
        let package = workspace::spec(release.id);
        let manifest = workspace::read_manifest(&root.join(package.manifest))?;
        for dependency_id in workspace::internal_dependency_ids(release.id) {
            let dependency = workspace::spec(*dependency_id);
            let dependency_release = by_id
                .get(dependency_id)
                .ok_or_else(|| format!("release graph is missing {}", dependency.name))?;
            let requirement = workspace::dependency_requirement(&manifest, dependency.name)
                .ok_or_else(|| {
                    format!("{} is missing dependency {}", package.name, dependency.name)
                })?;
            if !workspace::requirement_accepts(&requirement, &dependency_release.local)? {
                return Err(format!(
                    "{} requirement {} does not accept local {} {}",
                    package.name, requirement, dependency.name, dependency_release.local
                ));
            }
            if !dependency_release.pending && dependency_release.state.exact.is_none() {
                return Err(format!(
                    "{} {} is unavailable from crates.io",
                    dependency.name, dependency_release.local
                ));
            }
        }
    }
    Ok(())
}

fn prepare_package(root: &Path, release: &CrateRelease) -> Result<(), String> {
    let package = workspace::spec(release.id);
    println!("[release] preparing {} {}", package.name, release.local);
    process::run(
        Command::new("cargo")
            .args([
                "package",
                "--locked",
                "--no-verify",
                "--package",
                package.name,
            ])
            .current_dir(root),
        &format!("cargo package for {} {}", package.name, release.local),
    )?;
    let archive = process::target_directory(root)?
        .join("package")
        .join(format!("{}-{}.crate", package.name, release.local));
    let size = fs::metadata(&archive)
        .map_err(|error| format!("could not inspect {}: {error}", archive.display()))?
        .len();
    if size > CRATE_SIZE_LIMIT {
        return Err(format!(
            "{} is {:.2} MiB; crates.io packages must not exceed 10 MiB",
            archive.display(),
            size as f64 / 1024.0 / 1024.0
        ));
    }
    println!(
        "[release] package size {:.2} MiB",
        size as f64 / 1024.0 / 1024.0
    );
    Ok(())
}

fn print_facade_plan(git: &GitContext, releases: &[CrateRelease]) {
    println!("\nFacade release");
    println!("Source: {}", git.sha);
    println!("\nVersions:");
    for release in releases {
        let package = workspace::spec(release.id);
        let previous = release
            .state
            .latest
            .as_ref()
            .map(ToString::to_string)
            .unwrap_or_else(|| "unpublished".to_string());
        let action = if release.pending { "publish" } else { "skip" };
        println!(
            "  {:<16}  {} -> {}  {}",
            package.name, previous, release.local, action
        );
    }
    println!("\nTasks:");
    let mut task = 1;
    for release in releases.iter().filter(|release| release.pending) {
        let package = workspace::spec(release.id);
        println!(
            "  {task}. Package and verify {} {}",
            package.name, release.local
        );
        task += 1;
        println!("  {task}. Publish {} {}", package.name, release.local);
        task += 1;
        println!(
            "  {task}. Wait for crates.io to expose {} {}",
            package.name, release.local
        );
        task += 1;
    }
    println!("  {task}. Confirm the completed facade graph on crates.io");
}

fn release_product(
    root: &Path,
    git: &GitContext,
    target: ReleaseTarget,
    dry_run: bool,
    yes: bool,
) -> Result<(), String> {
    validate_gh_auth()?;
    let (label, version, tag_prefix, workflow) = match target {
        ReleaseTarget::Ocr => (
            "Native OCR",
            native_ocr_version(root)?,
            "ocr-v",
            "ocr-release.yml",
        ),
        ReleaseTarget::Cli => (
            "Squigit CLI",
            workspace::package_version(root, PackageId::Cli)?,
            "cli-v",
            "cli-release.yml",
        ),
        ReleaseTarget::Facade => return Err("invalid product release target".to_string()),
    };
    ensure_workflow_exists(workflow)?;
    let latest = latest_product_version(tag_prefix)?;
    if let Some(published) = latest.as_ref().filter(|published| version <= **published) {
        return Err(format!(
            "local {label} version {version} must be greater than published version {}",
            published
        ));
    }
    if matches!(target, ReleaseTarget::Cli) {
        ensure_cli_facade_is_published(root)?;
    }
    let mut release = ProductRelease {
        label,
        tag: format!("{tag_prefix}{version}"),
        workflow,
        version,
        latest,
        source_tag_exists: false,
    };
    release.source_tag_exists = verify_source_tag(root, &release.tag, &git.sha)?;
    print_product_plan(git, target, &release);
    if dry_run {
        println!("\nDry run complete. No source tag was pushed and no workflow was dispatched.");
        return Ok(());
    }
    if !confirm(yes)? {
        println!("Release cancelled.");
        return Ok(());
    }

    ensure_source_tag(root, &release.tag, &git.sha, release.source_tag_exists)?;
    let before = workflow_run_ids(workflow)?;
    dispatch_product_workflow(target, &release)?;
    let (run_id, url) = find_dispatched_run(workflow, &before)?;
    println!("Workflow: {url}");
    process::run(
        Command::new("gh").args([
            "run",
            "watch",
            &run_id.to_string(),
            "--repo",
            DISTRIBUTION_REPOSITORY,
            "--exit-status",
        ]),
        &format!("{label} distribution workflow"),
    )?;
    println!("{label} {} release complete", release.version);
    Ok(())
}

fn native_ocr_version(root: &Path) -> Result<Version, String> {
    let source = fs::read_to_string(root.join("squigit-ocr/native/VERSION"))
        .map_err(|error| format!("could not read native OCR VERSION: {error}"))?;
    workspace::parse_stable_version(source.trim())
}

fn validate_gh_auth() -> Result<(), String> {
    process::run(
        Command::new("gh").args(["auth", "status", "--hostname", "github.com"]),
        "GitHub authentication check",
    )
}

fn ensure_workflow_exists(workflow: &str) -> Result<(), String> {
    process::output(
        Command::new("gh").args([
            "api",
            &format!("repos/{DISTRIBUTION_REPOSITORY}/actions/workflows/{workflow}"),
        ]),
        &format!("distribution workflow {workflow} lookup"),
    )?;
    Ok(())
}

fn latest_product_version(prefix: &str) -> Result<Option<Version>, String> {
    let response = process::output(
        Command::new("gh").args([
            "api",
            &format!("repos/{DISTRIBUTION_REPOSITORY}/releases?per_page=100"),
        ]),
        "distribution release lookup",
    )?;
    let releases: Value = serde_json::from_str(&response)
        .map_err(|error| format!("could not parse distribution releases: {error}"))?;
    let mut latest = None;
    for release in releases.as_array().into_iter().flatten() {
        if release["draft"].as_bool().unwrap_or(false) {
            continue;
        }
        let Some(tag) = release["tag_name"].as_str() else {
            continue;
        };
        let Some(version) = tag.strip_prefix(prefix) else {
            continue;
        };
        let Ok(version) = workspace::parse_stable_version(version) else {
            continue;
        };
        if latest.as_ref().is_none_or(|current| version > *current) {
            latest = Some(version);
        }
    }
    Ok(latest)
}

fn ensure_cli_facade_is_published(root: &Path) -> Result<(), String> {
    let registry = Registry::new()?;
    for id in LIBRARY_IDS {
        let package = workspace::spec(id);
        let version = workspace::package_version(root, id)?;
        if registry
            .package_state(package.name, &version)?
            .exact
            .is_none()
        {
            return Err(format!(
                "{} {version} must be published before the CLI product release",
                package.name
            ));
        }
    }
    Ok(())
}

fn print_product_plan(git: &GitContext, target: ReleaseTarget, release: &ProductRelease) {
    let previous = release
        .latest
        .as_ref()
        .map(ToString::to_string)
        .unwrap_or_else(|| "unpublished".to_string());
    println!("\n{} release", release.label);
    println!("Source: {}", git.sha);
    println!("\nVersions:");
    println!(
        "  {:<16}  {} -> {}  release",
        release.label, previous, release.version
    );
    println!("\nWorkflow:");
    println!("  Repository: {DISTRIBUTION_REPOSITORY}");
    println!("  File:       {}", release.workflow);
    println!("  Source tag: {}", release.tag);
    println!(
        "  Tag action: {}",
        if release.source_tag_exists {
            "reuse"
        } else {
            "create and push"
        }
    );
    println!("\nTasks:");
    let mut task = 1;
    println!(
        "  {task}. {} immutable source tag {} at {}",
        if release.source_tag_exists {
            "Reuse"
        } else {
            "Create and push"
        },
        release.tag,
        git.sha
    );
    task += 1;
    match target {
        ReleaseTarget::Ocr => {
            println!("  {task}. Dispatch Ubuntu, Fedora, macOS ARM, and Windows builds");
            println!(
                "  {}. Validate the packaged OCR runtimes and size reports",
                task + 1
            );
            println!("  {}. Publish the distribution release", task + 2);
            println!("  {}. Update Homebrew, Winget, APT, and DNF", task + 3);
            println!("  {}. Submit the Winget package update", task + 4);
            println!("  {}. Wait for installed-product verification", task + 5);
        }
        ReleaseTarget::Cli => {
            println!("  {task}. Dispatch the CLI distribution build matrix");
            println!("  {}. Verify the registry-backed facade graph", task + 1);
            println!(
                "  {}. Publish the CLI distribution release and channels",
                task + 2
            );
            println!("  {}. Wait for installed-product verification", task + 3);
        }
        ReleaseTarget::Facade => {}
    }
}

fn dispatch_product_workflow(
    target: ReleaseTarget,
    release: &ProductRelease,
) -> Result<(), String> {
    let mut command = Command::new("gh");
    command.args([
        "workflow",
        "run",
        release.workflow,
        "--repo",
        DISTRIBUTION_REPOSITORY,
        "--ref",
        "main",
        "-f",
        &format!("version={}", release.version),
        "-f",
        &format!("source_ref={}", release.tag),
        "-f",
        &format!("release_tag={}", release.tag),
    ]);
    if matches!(target, ReleaseTarget::Ocr) {
        command.args([
            "-f",
            "release_homebrew=true",
            "-f",
            "release_winget=true",
            "-f",
            "submit_winget_pr=true",
            "-f",
            "release_apt=true",
            "-f",
            "release_dnf=true",
        ]);
    }
    process::run(
        &mut command,
        &format!("{} workflow dispatch", release.label),
    )
}

fn verify_source_tag(root: &Path, tag: &str, expected_sha: &str) -> Result<bool, String> {
    if let Some(remote_sha) = remote_tag_sha(root, tag)? {
        if remote_sha != expected_sha {
            return Err(format!(
                "source tag {tag} already points to {remote_sha}; expected {expected_sha}"
            ));
        }
        return Ok(true);
    }

    if let Some(local_sha) = local_tag_sha(root, tag)? {
        if local_sha != expected_sha {
            return Err(format!(
                "local source tag {tag} points to {local_sha}; expected {expected_sha}"
            ));
        }
    }
    Ok(false)
}

fn ensure_source_tag(
    root: &Path,
    tag: &str,
    expected_sha: &str,
    remote_exists: bool,
) -> Result<(), String> {
    if remote_exists {
        println!("[release] reusing source tag {tag}");
        return Ok(());
    }

    if local_tag_sha(root, tag)?.is_none() {
        process::run(
            Command::new("git")
                .args([
                    "tag",
                    "--annotate",
                    tag,
                    expected_sha,
                    "--message",
                    &format!("Release source {tag}"),
                ])
                .current_dir(root),
            &format!("create source tag {tag}"),
        )?;
    }

    let status = Command::new("git")
        .args(["push", "origin", &format!("refs/tags/{tag}")])
        .current_dir(root)
        .status()
        .map_err(|error| format!("could not push source tag {tag}: {error}"))?;
    if status.success() {
        return Ok(());
    }
    if remote_tag_sha(root, tag)?.as_deref() == Some(expected_sha) {
        println!("[release] source tag {tag} was pushed concurrently; reusing it");
        Ok(())
    } else {
        Err(format!("could not push source tag {tag}"))
    }
}

fn local_tag_sha(root: &Path, tag: &str) -> Result<Option<String>, String> {
    let output = process::raw_output(
        Command::new("git")
            .args(["rev-parse", "--verify", &format!("refs/tags/{tag}^{{}}")])
            .current_dir(root),
        &format!("local source tag {tag} lookup"),
    )?;
    if !output.status.success() {
        return Ok(None);
    }
    String::from_utf8(output.stdout)
        .map(|sha| Some(sha.trim().to_string()))
        .map_err(|error| format!("local source tag {tag} produced non-UTF-8 output: {error}"))
}

fn remote_tag_sha(root: &Path, tag: &str) -> Result<Option<String>, String> {
    let direct = format!("refs/tags/{tag}");
    let peeled = format!("refs/tags/{tag}^{{}}");
    let output = process::raw_output(
        Command::new("git")
            .args(["ls-remote", "--tags", "origin", &direct, &peeled])
            .current_dir(root),
        &format!("remote source tag {tag} lookup"),
    )?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!(
                "remote source tag {tag} lookup failed with {}",
                output.status
            )
        } else {
            format!("remote source tag {tag} lookup failed: {stderr}")
        });
    }
    let stdout = String::from_utf8(output.stdout)
        .map_err(|error| format!("remote source tag {tag} produced non-UTF-8 output: {error}"))?;
    let mut direct_sha = None;
    for line in stdout.lines() {
        let Some((sha, reference)) = line.split_once(char::is_whitespace) else {
            continue;
        };
        if reference.trim() == peeled {
            return Ok(Some(sha.to_string()));
        }
        if reference.trim() == direct {
            direct_sha = Some(sha.to_string());
        }
    }
    Ok(direct_sha)
}

fn workflow_run_ids(workflow: &str) -> Result<HashSet<u64>, String> {
    Ok(workflow_runs(workflow)?
        .into_iter()
        .map(|(id, _)| id)
        .collect())
}

fn workflow_runs(workflow: &str) -> Result<Vec<(u64, String)>, String> {
    let response = process::output(
        Command::new("gh").args([
            "run",
            "list",
            "--repo",
            DISTRIBUTION_REPOSITORY,
            "--workflow",
            workflow,
            "--event",
            "workflow_dispatch",
            "--limit",
            "20",
            "--json",
            "databaseId,url",
        ]),
        &format!("{workflow} run lookup"),
    )?;
    let runs: Value = serde_json::from_str(&response)
        .map_err(|error| format!("could not parse workflow runs: {error}"))?;
    Ok(runs
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|run| {
            Some((
                run["databaseId"].as_u64()?,
                run["url"].as_str()?.to_string(),
            ))
        })
        .collect())
}

fn find_dispatched_run(workflow: &str, before: &HashSet<u64>) -> Result<(u64, String), String> {
    let started = Instant::now();
    loop {
        let new_runs: Vec<_> = workflow_runs(workflow)?
            .into_iter()
            .filter(|(id, _)| !before.contains(id))
            .collect();
        match new_runs.as_slice() {
            [(id, url)] => return Ok((*id, url.clone())),
            [] if started.elapsed() < Duration::from_secs(90) => {
                thread::sleep(Duration::from_secs(3));
            }
            [] => return Err(format!("could not find the dispatched {workflow} run")),
            _ => {
                return Err(format!(
                    "multiple new {workflow} runs appeared; inspect GitHub Actions to identify this release"
                ))
            }
        }
    }
}

fn confirm(yes: bool) -> Result<bool, String> {
    println!();
    if yes {
        println!("Continue? [Y/n] Y (--yes)");
        return Ok(true);
    }
    if !io::stdin().is_terminal() {
        return Err("noninteractive releases require --yes".to_string());
    }
    loop {
        print!("Continue? [Y/n] ");
        io::stdout().flush().map_err(|error| error.to_string())?;
        let mut answer = String::new();
        io::stdin()
            .read_line(&mut answer)
            .map_err(|error| format!("could not read release confirmation: {error}"))?;
        match answer.trim() {
            "" | "Y" | "y" => return Ok(true),
            "N" | "n" => return Ok(false),
            _ => println!("Enter Y to continue or N to cancel."),
        }
    }
}
