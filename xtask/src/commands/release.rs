use crate::registry::manifest::{Operation, VersionScheme};
use crate::registry::Registry;
use crate::{console, Runtime, XtaskResult};
use semver::Version;
use std::cmp::Ordering;
use std::path::Path;
use std::process::{Command, Output, Stdio};

const RELEASE_REMOTE: &str = "origin";

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if registry.is_repository() {
        if args.is_empty() {
            console::render_root_screen(runtime, registry, "release");
            return 0;
        }
        return super::fail(runtime, "release requires a registered component path.");
    }

    if !args.is_empty() {
        return super::fail(runtime, "release does not accept arguments.");
    }
    let component = match super::component_operation(runtime, registry, Operation::Release) {
        Ok(component) => component,
        Err(code) => return code,
    };
    if component.operation(Operation::Release).handler == "cli-release" {
        runtime.note("CLI release is coming soon.");
        return 0;
    }
    let version = component
        .current_version
        .as_deref()
        .expect("release version exists");
    let tag = match registry.release_tag(component, version) {
        Ok(tag) => tag,
        Err(error) => return super::fail(runtime, &error),
    };

    let release = component
        .manifest
        .release
        .as_ref()
        .expect("release configuration exists");
    if let Err(error) = prepare_release(
        &registry.repo_root,
        component.display_name(),
        version,
        component.manifest.version.scheme,
        &release.tag,
        &tag,
    ) {
        return super::fail(runtime, &error);
    }
    match publish_tag(
        runtime,
        &registry.repo_root,
        component.display_name(),
        version,
        &tag,
    ) {
        Ok(()) => 0,
        Err(error) => super::fail(runtime, &error),
    }
}

fn prepare_release(
    repo_root: &Path,
    component: &str,
    version: &str,
    scheme: VersionScheme,
    tag_template: &str,
    tag: &str,
) -> XtaskResult {
    ensure_clean_tree(repo_root)?;
    ensure_remote(repo_root)?;
    ensure_valid_tag(repo_root, tag)?;
    if local_tag_exists(repo_root, tag)? {
        return Err(format!("Tag '{tag}' already exists locally."));
    }
    ensure_version_is_newer(repo_root, component, version, scheme, tag_template)?;
    Ok(())
}

fn ensure_clean_tree(repo_root: &Path) -> XtaskResult {
    let output = git_output(
        repo_root,
        &["status", "--porcelain=v1", "--untracked-files=normal"],
        "inspect the Git tree",
    )?;
    let status = String::from_utf8_lossy(&output.stdout);
    if status.trim().is_empty() {
        return Ok(());
    }
    Err("Release requires a clean Git tree. Commit or stash your changes first.".to_string())
}

fn ensure_remote(repo_root: &Path) -> XtaskResult {
    git_output(
        repo_root,
        &["remote", "get-url", RELEASE_REMOTE],
        "resolve the release remote",
    )?;
    Ok(())
}

fn ensure_valid_tag(repo_root: &Path, tag: &str) -> XtaskResult {
    let reference = format!("refs/tags/{tag}");
    git_output(
        repo_root,
        &["check-ref-format", &reference],
        "validate the release tag",
    )?;
    Ok(())
}

fn local_tag_exists(repo_root: &Path, tag: &str) -> XtaskResult<bool> {
    let reference = format!("refs/tags/{tag}");
    let output = Command::new("git")
        .args(["rev-parse", "--verify", "--quiet", &reference])
        .current_dir(repo_root)
        .output()
        .map_err(|error| format!("Could not inspect local Git tags: {error}"))?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => Err(command_failure("inspect local Git tags", &output)),
    }
}

fn ensure_version_is_newer(
    repo_root: &Path,
    component: &str,
    version: &str,
    scheme: VersionScheme,
    tag_template: &str,
) -> XtaskResult {
    let output = git_output(
        repo_root,
        &["ls-remote", "--tags", RELEASE_REMOTE],
        "inspect remote release tags",
    )?;
    let mut latest: Option<(String, String)> = None;

    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let Some(reference) = line.split_whitespace().nth(1) else {
            continue;
        };
        let Some(tag) = reference.strip_prefix("refs/tags/") else {
            continue;
        };
        if tag.ends_with("^{}") {
            continue;
        }
        let Some(candidate) = version_from_tag(tag_template, tag) else {
            continue;
        };
        validate_release_version(scheme, candidate)
            .map_err(|error| format!("Remote tag '{tag}' is invalid: {error}"))?;
        let replace = match &latest {
            None => true,
            Some((_, latest_version)) => {
                compare_release_versions(scheme, candidate, latest_version)? == Ordering::Greater
            }
        };
        if replace {
            latest = Some((tag.to_string(), candidate.to_string()));
        }
    }

    validate_release_version(scheme, version)?;
    if let Some((latest_tag, latest_version)) = latest {
        if compare_release_versions(scheme, version, &latest_version)? != Ordering::Greater {
            return Err(format!(
                "Cannot release {component} {version}: latest remote tag is '{latest_tag}'. Bump the local component version first."
            ));
        }
    }
    Ok(())
}

fn version_from_tag<'a>(template: &str, tag: &'a str) -> Option<&'a str> {
    let (prefix, suffix) = template.split_once("{version}")?;
    tag.strip_prefix(prefix)?.strip_suffix(suffix)
}

fn validate_release_version(scheme: VersionScheme, version: &str) -> XtaskResult {
    match scheme {
        VersionScheme::Semver => Version::parse(version)
            .map(|_| ())
            .map_err(|error| format!("'{version}' is not valid SemVer: {error}")),
        VersionScheme::Calver => parse_calver(version).map(|_| ()),
        VersionScheme::None => Err("Unversioned components cannot be released.".to_string()),
    }
}

fn compare_release_versions(
    scheme: VersionScheme,
    left: &str,
    right: &str,
) -> XtaskResult<Ordering> {
    match scheme {
        VersionScheme::Semver => {
            let left = Version::parse(left)
                .map_err(|error| format!("'{left}' is not valid SemVer: {error}"))?;
            let right = Version::parse(right)
                .map_err(|error| format!("'{right}' is not valid SemVer: {error}"))?;
            Ok(left.cmp(&right))
        }
        VersionScheme::Calver => Ok(parse_calver(left)?.cmp(&parse_calver(right)?)),
        VersionScheme::None => Err("Unversioned components cannot be released.".to_string()),
    }
}

fn parse_calver(version: &str) -> XtaskResult<[u64; 4]> {
    let parts = version.split('.').collect::<Vec<_>>();
    if !matches!(parts.len(), 3 | 4) {
        return Err(format!(
            "'{version}' is not valid CalVer; expected YY.MM.DD or YY.MM.DD.N."
        ));
    }
    let mut parsed = [0_u64; 4];
    for (index, part) in parts.iter().enumerate() {
        parsed[index] = part.parse::<u64>().map_err(|_| {
            format!("'{version}' is not valid CalVer; every segment must be numeric.")
        })?;
    }
    Ok(parsed)
}

fn publish_tag(
    runtime: &Runtime,
    repo_root: &Path,
    component: &str,
    version: &str,
    tag: &str,
) -> XtaskResult {
    let message = format!("Release {component} {version}");
    git_output(
        repo_root,
        &["tag", "--annotate", tag, "--message", &message],
        "create the release tag",
    )?;

    println!("  $ git push {RELEASE_REMOTE} refs/tags/{tag}");
    let status = Command::new("git")
        .args(["push", RELEASE_REMOTE, &format!("refs/tags/{tag}")])
        .current_dir(repo_root)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()
        .map_err(|error| format!("Could not push release tag '{tag}': {error}"))?;
    if !status.success() {
        return Err(format!(
            "Could not push release tag '{tag}'. The local tag remains available for retry."
        ));
    }

    runtime.success(&format!("Released {component} {version}"));
    println!("  tag: {tag}");
    println!("  remote: {RELEASE_REMOTE}");
    Ok(())
}

fn git_output(repo_root: &Path, args: &[&str], action: &str) -> XtaskResult<Output> {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_root)
        .output()
        .map_err(|error| format!("Could not {action}: {error}"))?;
    if output.status.success() {
        Ok(output)
    } else {
        Err(command_failure(action, &output))
    }
}

fn command_failure(action: &str, output: &Output) -> String {
    let detail = String::from_utf8_lossy(&output.stderr);
    let detail = detail.trim();
    if detail.is_empty() {
        format!("Could not {action}: Git exited with {}.", output.status)
    } else {
        format!("Could not {action}: {detail}")
    }
}
