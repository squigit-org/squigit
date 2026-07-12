pub mod discovery;
pub mod manifest;
pub mod validation;

use crate::error;
use crate::registry::discovery::{
    discover_component_manifests, find_repository_root, read_header, require_context_manifest,
    MANIFEST_NAME,
};
use crate::registry::manifest::{
    Category, ComponentManifest, Operation, OperationConfig, RootManifest,
};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug)]
pub struct Component {
    pub manifest_path: PathBuf,
    pub directory: PathBuf,
    pub manifest: ComponentManifest,
    pub current_version: Option<String>,
}

impl Component {
    pub fn name(&self) -> &str {
        &self.manifest.context.name
    }

    pub fn display_name(&self) -> &str {
        &self.manifest.context.display_name
    }

    pub fn category(&self) -> Category {
        self.manifest.context.category
    }

    pub fn operation(&self, operation: Operation) -> &OperationConfig {
        self.manifest.operations.get(operation)
    }

    pub fn supports(&self, operation: Operation) -> bool {
        self.operation(operation).enabled
    }

    pub fn relative_directory<'a>(&'a self, repo_root: &Path) -> &'a Path {
        self.directory
            .strip_prefix(repo_root)
            .unwrap_or(&self.directory)
    }
}

#[derive(Clone, Debug)]
pub enum InvocationContext {
    Repository,
    Component(PathBuf),
}

#[derive(Clone, Debug)]
pub struct Registry {
    pub repo_root: PathBuf,
    pub root_manifest_path: PathBuf,
    pub root: RootManifest,
    pub components: Vec<Component>,
    pub context: InvocationContext,
    pub root_version: String,
}

impl Registry {
    pub fn load_from_current_dir() -> Result<Self, String> {
        let cwd = std::env::current_dir().map_err(|error| error::read_current_dir(&error))?;
        Self::load_from(&cwd)
    }

    pub fn load_from(cwd: &Path) -> Result<Self, String> {
        let cwd = cwd
            .canonicalize()
            .map_err(|error| error::resolve_path(cwd, &error))?;
        let local_manifest = require_context_manifest(&cwd)?;
        let local_header = read_header(&local_manifest)?;
        let repo_root = find_repository_root(&cwd, local_header.context.kind)?;
        let root_manifest_path = repo_root
            .join(MANIFEST_NAME)
            .canonicalize()
            .map_err(|error| {
                error::resolve_repo_manifest(&repo_root.join(MANIFEST_NAME), &error)
            })?;

        let mut errors = Vec::new();
        let root_body = fs::read_to_string(&root_manifest_path)
            .map_err(|error| error::read_manifest(&root_manifest_path, &error))?;
        let root: RootManifest = toml::from_str(&root_body)
            .map_err(|error| error::parse_manifest(&root_manifest_path, &error))?;
        validation::validate_root(&repo_root, &root, &mut errors);

        let (manifest_paths, discovery_errors) =
            discover_component_manifests(&repo_root, &root.discovery.roots);
        errors.extend(discovery_errors);

        let mut components = Vec::new();
        for manifest_path in manifest_paths {
            let body = match fs::read_to_string(&manifest_path) {
                Ok(body) => body,
                Err(error) => {
                    errors.push(error::read_manifest(&manifest_path, &error));
                    continue;
                }
            };
            let manifest: ComponentManifest = match toml::from_str(&body) {
                Ok(manifest) => manifest,
                Err(error) => {
                    errors.push(error::parse_manifest(&manifest_path, &error));
                    continue;
                }
            };
            let directory = manifest_path
                .parent()
                .expect("component manifest has a parent")
                .to_path_buf();
            let current_version = validation::validate_component(
                &repo_root,
                &manifest_path,
                &directory,
                &manifest,
                &mut errors,
            );
            components.push(Component {
                manifest_path,
                directory,
                manifest,
                current_version,
            });
        }

        validation::validate_uniqueness(&components, &mut errors);
        components.sort_by(|left, right| {
            (left.category(), left.manifest.context.order, left.name()).cmp(&(
                right.category(),
                right.manifest.context.order,
                right.name(),
            ))
        });

        let root_version = validation::read_version(&repo_root, &root.version)
            .map_err(|error| error::root_version_read(&root_manifest_path, &error))?
            .ok_or_else(|| error::root_version_missing(&root_manifest_path))?;
        validation::validate_version_value(
            &root_version,
            root.version.scheme,
            &root_manifest_path,
            &mut errors,
        );

        let context = if local_manifest == root_manifest_path {
            InvocationContext::Repository
        } else if components
            .iter()
            .any(|component| component.manifest_path == local_manifest)
        {
            InvocationContext::Component(local_manifest.clone())
        } else {
            errors.push(error::unregistered_component(
                &root_manifest_path,
                &local_manifest,
            ));
            InvocationContext::Component(local_manifest)
        };

        if errors.is_empty() {
            Ok(Self {
                repo_root,
                root_manifest_path,
                root,
                components,
                context,
                root_version,
            })
        } else {
            Err(validation::format_validation_errors(errors))
        }
    }

    pub fn is_repository(&self) -> bool {
        matches!(self.context, InvocationContext::Repository)
    }

    pub fn current_target(&self) -> Option<&Component> {
        let InvocationContext::Component(path) = &self.context else {
            return None;
        };
        self.components
            .iter()
            .find(|component| &component.manifest_path == path)
    }

    pub fn target_by_relative_path(&self, value: &str) -> Option<&Component> {
        let requested = Path::new(value);
        if requested.is_absolute()
            || requested.components().any(|component| {
                matches!(
                    component,
                    std::path::Component::ParentDir
                        | std::path::Component::RootDir
                        | std::path::Component::Prefix(_)
                )
            })
        {
            return None;
        }
        self.components.iter().find(|component| {
            component
                .directory
                .strip_prefix(&self.repo_root)
                .is_ok_and(|relative| relative == requested)
        })
    }

    pub fn target_for_command(&self, command: &str, value: &str) -> Option<&Component> {
        self.target_by_relative_path(value)
            .or_else(|| match command {
                "build" => self.target_by_build_alias(value),
                "release" => self.target_by_release_alias(value),
                _ => None,
            })
    }

    fn target_by_build_alias(&self, value: &str) -> Option<&Component> {
        let alias = value.trim();
        self.components.iter().find(|component| {
            if !component.supports(Operation::Build) {
                return false;
            }
            if component_matches_alias(component, alias) {
                return true;
            }
            let handler = component.operation(Operation::Build).handler.as_str();
            match handler {
                "paddle-ocr" => {
                    alias.eq_ignore_ascii_case("ocr") || alias.eq_ignore_ascii_case("paddle")
                }
                "whisper-stt" => {
                    alias.eq_ignore_ascii_case("stt") || alias.eq_ignore_ascii_case("whisper")
                }
                _ => false,
            }
        })
    }

    fn target_by_release_alias(&self, value: &str) -> Option<&Component> {
        let alias = value.trim();
        self.components.iter().find(|component| {
            if !component.supports(Operation::Release) {
                return false;
            }
            if component_matches_alias(component, alias) {
                return true;
            }
            let handler = component.operation(Operation::Release).handler.as_str();
            match handler {
                "cli-release" => alias.eq_ignore_ascii_case("cli"),
                "desktop-release" => {
                    alias.eq_ignore_ascii_case("desktop") || alias.eq_ignore_ascii_case("squigit")
                }
                "renderer-release" => alias.eq_ignore_ascii_case("renderer"),
                "paddle-release" => {
                    alias.eq_ignore_ascii_case("ocr") || alias.eq_ignore_ascii_case("paddle")
                }
                "whisper-release" => {
                    alias.eq_ignore_ascii_case("stt") || alias.eq_ignore_ascii_case("whisper")
                }
                _ => false,
            }
        })
    }

    pub fn context_name(&self) -> &str {
        self.current_target()
            .map_or(&self.root.context.name, Component::display_name)
    }

    pub fn targets_for(&self, operation: Operation) -> Vec<&Component> {
        self.components
            .iter()
            .filter(|component| component.supports(operation))
            .collect()
    }

    pub fn root_operation(&self, command: &str) -> Option<&OperationConfig> {
        self.root.operations.get(command)
    }

    pub fn release_tag(&self, component: &Component, version: &str) -> Result<String, String> {
        let template = component
            .manifest
            .release
            .as_ref()
            .ok_or_else(|| error::no_release_config(component))?
            .tag
            .as_str();
        Ok(template.replace("{version}", version))
    }

    pub fn bump_files(&self, component: Option<&Component>) -> Vec<PathBuf> {
        match component {
            None => self
                .root
                .version
                .files
                .iter()
                .map(|path| self.repo_root.join(path))
                .collect(),
            Some(component) => component
                .manifest
                .version
                .files
                .iter()
                .map(|path| component.directory.join(path))
                .collect(),
        }
    }
}

fn component_matches_alias(component: &Component, alias: &str) -> bool {
    component.name().eq_ignore_ascii_case(alias)
        || component.display_name().eq_ignore_ascii_case(alias)
}
