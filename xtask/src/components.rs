pub mod apps;
pub mod crates;
pub mod packages;
pub mod sidecars;

use crate::registry::manifest::Category;
use crate::registry::manifest::Operation;
use crate::registry::Component;
use crate::{Runtime, XtaskResult};
use std::path::PathBuf;

use crate::error;

pub struct BuildOptions<'a> {
    pub commit_sha: Option<&'a str>,
    pub native: bool,
    pub measure_payload: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TestBackend {
    Cargo,
    Node,
    LiveOnly,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TestTarget {
    pub path: PathBuf,
    pub runner_name: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TestInventory {
    pub inline: bool,
    pub targets: Vec<TestTarget>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TestSelection {
    pub inline: bool,
    pub targets: Vec<TestTarget>,
}

impl TestSelection {
    pub fn is_empty(&self) -> bool {
        !self.inline && self.targets.is_empty()
    }
}

pub fn dev(runtime: &Runtime, component: &Component) -> XtaskResult {
    match component.category() {
        Category::Apps => apps::dev::run(runtime, component),
        _ => error::unsupported(component, Operation::Dev),
    }
}

pub fn build(runtime: &Runtime, component: &Component, options: &BuildOptions<'_>) -> XtaskResult {
    match component.category() {
        Category::Apps => apps::build::run(runtime, component, options),
        Category::Crates => crates::build::run(runtime, component, options),
        Category::Sidecars => sidecars::build::run(runtime, component, options),
        Category::Packages => error::unsupported(component, Operation::Build),
    }
}

pub fn test(runtime: &Runtime, component: &Component, selection: &TestSelection) -> XtaskResult {
    match component.category() {
        Category::Apps => apps::test::run(runtime, component, selection),
        Category::Packages => packages::test::run(runtime, component, selection),
        Category::Crates => crates::test::run(runtime, component, selection),
        Category::Sidecars => sidecars::test::run(runtime, component, selection),
    }
}

pub fn clean(runtime: &Runtime, component: &Component) -> XtaskResult {
    match component.category() {
        Category::Apps => apps::clean::run(runtime, component),
        Category::Crates => crates::clean::run(runtime, component),
        Category::Sidecars => sidecars::clean::run(runtime, component),
        Category::Packages => error::unsupported(component, Operation::Clean),
    }
}

pub fn bump(
    runtime: &Runtime,
    component: &Component,
    version: &str,
    files: &[PathBuf],
) -> XtaskResult {
    match component.category() {
        Category::Apps => apps::bump::run(runtime, component, version, files),
        Category::Packages => packages::bump::run(runtime, component, version, files),
        Category::Crates => crates::bump::run(runtime, component, version, files),
        Category::Sidecars => sidecars::bump::run(runtime, component, version, files),
    }
}
