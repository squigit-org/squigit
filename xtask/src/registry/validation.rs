use super::discovery::{validate_relative_path, MANIFEST_NAME};
use super::manifest::{
    Category, ComponentManifest, ContextKind, Operation, OperationConfig, RootManifest,
    UiMenu, UiPrompt, UiScreen, UiVocabulary, VersionConfig, VersionFormat, VersionScheme,
    SCHEMA_VERSION,
};
use super::Component;
use regex::Regex;
use semver::Version;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

pub fn validate_root(repo_root: &Path, manifest: &RootManifest, errors: &mut Vec<String>) {
    let owner = repo_root.join(MANIFEST_NAME);
    validate_schema_and_kind(
        manifest.schema,
        manifest.context.kind,
        ContextKind::Repository,
        &owner,
        errors,
    );
    validate_nonempty("context.name", &manifest.context.name, &owner, errors);
    validate_nonempty(
        "context.temp_namespace",
        &manifest.context.temp_namespace,
        &owner,
        errors,
    );
    if manifest.discovery.roots.is_empty() {
        errors.push(format!(
            "{}: discovery.roots may not be empty",
            owner.display()
        ));
    }
    for root in &manifest.discovery.roots {
        if let Err(error) = validate_relative_path(Path::new(root)) {
            errors.push(format!(
                "{}: discovery root '{root}': {error}",
                owner.display()
            ));
        }
    }
    validate_version_config(repo_root, &owner, &manifest.version, errors);
    for (name, operation) in manifest.operations.iter() {
        validate_operation(&owner, name, operation, true, errors);
    }
    validate_root_ui(&owner, manifest, errors);

}

pub fn validate_component(
    repo_root: &Path,
    owner: &Path,
    directory: &Path,
    manifest: &ComponentManifest,
    errors: &mut Vec<String>,
) -> Option<String> {
    validate_schema_and_kind(
        manifest.schema,
        manifest.context.kind,
        ContextKind::Component,
        owner,
        errors,
    );
    validate_slug("context.name", &manifest.context.name, owner, errors);
    validate_nonempty(
        "context.display_name",
        &manifest.context.display_name,
        owner,
        errors,
    );
    validate_version_config(directory, owner, &manifest.version, errors);
    validate_component_ui(owner, manifest, errors);

    if let Err(error) = validate_relative_path(Path::new(&manifest.tests.root)) {
        errors.push(format!("{}: tests.root: {error}", owner.display()));
    }
    if manifest.tests.include.is_empty() && manifest.operations.test.enabled {
        errors.push(format!(
            "{}: test-enabled components require tests.include patterns",
            owner.display()
        ));
    }
    let mut glob_builder = globset::GlobSetBuilder::new();
    for pattern in &manifest.tests.include {
        if let Err(error) = validate_relative_path(Path::new(pattern)) {
            errors.push(format!(
                "{}: test include pattern '{pattern}': {error}",
                owner.display()
            ));
            continue;
        }
        match globset::Glob::new(pattern) {
            Ok(glob) => {
                glob_builder.add(glob);
            }
            Err(error) => errors.push(format!(
                "{}: invalid test include pattern '{pattern}': {error}",
                owner.display()
            )),
        }
    }
    if let Err(error) = glob_builder.build() {
        errors.push(format!(
            "{}: invalid test patterns: {error}",
            owner.display()
        ));
    }

    for operation in Operation::ALL {
        let config = manifest.operations.get(operation);
        validate_operation(owner, operation.name(), config, false, errors);
        validate_component_handler(owner, operation, config, errors);
        if operation != Operation::Build && config.requires_commit_sha {
            errors.push(format!(
                "{}: requires_commit_sha is only valid for build",
                owner.display()
            ));
        }
    }

    if manifest.operations.release.enabled {
        match &manifest.release {
            Some(release) => validate_release_config(owner, &release.tag, errors),
            None => errors.push(format!(
                "{}: release is enabled but [release] is missing",
                owner.display()
            )),
        }
        if manifest.version.scheme == VersionScheme::None {
            errors.push(format!(
                "{}: release cannot be enabled for an unversioned component",
                owner.display()
            ));
        }
    } else if manifest.release.is_some() {
        errors.push(format!(
            "{}: [release] exists while release execution is disabled",
            owner.display()
        ));
    }

    let version = match read_version(directory, &manifest.version) {
        Ok(version) => version,
        Err(error) => {
            errors.push(format!("{}: {error}", owner.display()));
            None
        }
    };
    if let Some(version) = &version {
        validate_version_value(version, manifest.version.scheme, owner, errors);
    }

    if !directory.starts_with(repo_root) {
        errors.push(format!(
            "{}: component directory escapes the repository",
            owner.display()
        ));
    }
    version
}

pub fn validate_schema_and_kind(
    schema: u32,
    actual: ContextKind,
    expected: ContextKind,
    owner: &Path,
    errors: &mut Vec<String>,
) {
    if schema != SCHEMA_VERSION {
        errors.push(format!(
            "{}: unsupported schema {schema}; expected {SCHEMA_VERSION}",
            owner.display()
        ));
    }
    if actual != expected {
        errors.push(format!(
            "{}: context.kind must be {:?}",
            owner.display(),
            expected
        ));
    }
}

pub fn validate_version_config(
    base: &Path,
    owner: &Path,
    config: &VersionConfig,
    errors: &mut Vec<String>,
) {
    for path in &config.files {
        if let Err(error) = validate_relative_path(Path::new(path)) {
            errors.push(format!(
                "{}: version file '{path}': {error}",
                owner.display()
            ));
        }
    }
    match config.scheme {
        VersionScheme::None => {
            if config.source.is_some() || !config.files.is_empty() || config.include_root {
                errors.push(format!(
                    "{}: unversioned contexts may not define version sources or files",
                    owner.display()
                ));
            }
        }
        VersionScheme::Semver | VersionScheme::Calver => {
            let Some(source) = &config.source else {
                errors.push(format!("{}: version.source is required", owner.display()));
                return;
            };
            if let Err(error) = validate_relative_path(Path::new(&source.path)) {
                errors.push(format!("{}: version source: {error}", owner.display()));
            } else if !base.join(&source.path).is_file() {
                errors.push(format!(
                    "{}: version source does not exist: {}",
                    owner.display(),
                    base.join(&source.path).display()
                ));
            }
            match source.format {
                VersionFormat::Plain => {
                    if source.key.is_some() || source.pattern.is_some() {
                        errors.push(format!(
                            "{}: plain version sources do not accept key or pattern",
                            owner.display()
                        ));
                    }
                }
                VersionFormat::Json | VersionFormat::Toml => {
                    if source.key.as_deref().is_none_or(str::is_empty) || source.pattern.is_some() {
                        errors.push(format!(
                            "{}: structured version sources require key and forbid pattern",
                            owner.display()
                        ));
                    }
                }
                VersionFormat::Regex => {
                    let Some(pattern) = &source.pattern else {
                        errors.push(format!(
                            "{}: regex version sources require pattern",
                            owner.display()
                        ));
                        return;
                    };
                    match Regex::new(pattern) {
                        Ok(regex)
                            if regex
                                .capture_names()
                                .flatten()
                                .any(|name| name == "version") => {}
                        Ok(_) => errors.push(format!(
                            "{}: version regex requires a named 'version' capture",
                            owner.display()
                        )),
                        Err(error) => errors.push(format!(
                            "{}: invalid version regex: {error}",
                            owner.display()
                        )),
                    }
                    if source.key.is_some() {
                        errors.push(format!(
                            "{}: regex version sources do not accept key",
                            owner.display()
                        ));
                    }
                }
            }
        }
    }
}

pub fn validate_version_value(
    value: &str,
    scheme: VersionScheme,
    owner: &Path,
    errors: &mut Vec<String>,
) {
    match scheme {
        VersionScheme::Semver if Version::parse(value).is_err() => errors.push(format!(
            "{}: version '{value}' is not valid SemVer",
            owner.display()
        )),
        VersionScheme::Calver => {
            let valid = Regex::new(r"^\d{2}\.\d{2}\.\d{2}(?:\.\d+)?$")
                .expect("CalVer regex is valid")
                .is_match(value);
            if !valid {
                errors.push(format!(
                    "{}: version '{value}' is not valid CalVer",
                    owner.display()
                ));
            }
        }
        _ => {}
    }
}

pub fn validate_operation(
    owner: &Path,
    name: &str,
    config: &OperationConfig,
    root: bool,
    errors: &mut Vec<String>,
) {
    validate_nonempty(
        &format!("operations.{name}.description"),
        &config.description,
        owner,
        errors,
    );
    if config.enabled && config.handler == "none" {
        errors.push(format!(
            "{}: enabled operation '{name}' requires a stable handler",
            owner.display()
        ));
    }
    if !config.enabled && config.handler != "none" {
        errors.push(format!(
            "{}: disabled operation '{name}' must use handler 'none'",
            owner.display()
        ));
    }
    if root {
        let expected = match name {
            "doctor" => "doctor",
            "dev" | "build" | "release" => "component",
            "test" | "clean" => "workspace",
            "bump" => "root-bump",
            "live" => "live",
            "crypto" => "crypto",
            _ => "",
        };
        if config.handler != expected {
            errors.push(format!(
                "{}: root operation '{name}' requires handler '{expected}'",
                owner.display()
            ));
        }
    }
}

pub fn validate_component_handler(
    owner: &Path,
    operation: Operation,
    config: &OperationConfig,
    errors: &mut Vec<String>,
) {
    if !config.enabled {
        return;
    }
    let allowed: &[&str] = match operation {
        Operation::Dev => &["cli-dev", "desktop-dev", "renderer-dev", "tauri-dev"],
        Operation::Doctor
        | Operation::Build
        | Operation::Test
        | Operation::Clean
        | Operation::Bump => &[
            "node-app",
            "node-package",
            "cargo-crate",
            "paddle-ocr",
            "qt-capture",
            "whisper-stt",
        ],
        Operation::Release => &[
            "cli-release",
            "desktop-release",
            "renderer-release",
            "paddle-release",
            "whisper-release",
        ],
    };
    if !allowed.contains(&config.handler.as_str()) {
        errors.push(format!(
            "{}: handler '{}' is not valid for operation '{}'",
            owner.display(),
            config.handler,
            operation.name()
        ));
    }
}

fn validate_root_ui(owner: &Path, manifest: &RootManifest, errors: &mut Vec<String>) {
    validate_vocabulary(owner, &manifest.ui.vocabulary, errors);
    validate_menu(owner, "ui.menu", &manifest.ui.menu, errors);

    let required_screens = [
        "dev",
        "build",
        "release",
        "live",
        "live.auth",
        "live.brain",
        "live.ocr",
        "live.capture",
        "crypto",
        "crypto.sign",
    ];
    for route in required_screens {
        if !manifest.ui.screens.contains_key(route) {
            errors.push(format!(
                "{}: ui.screens.{route} is required",
                owner.display()
            ));
        }
    }
    for (route, screen) in &manifest.ui.screens {
        if !required_screens.contains(&route.as_str()) {
            errors.push(format!(
                "{}: unknown root UI screen route '{route}'",
                owner.display()
            ));
        }
        validate_screen(owner, &format!("ui.screens.{route}"), screen, errors);
    }

    validate_prompt_map(owner, &manifest.ui.prompts, &["crypto.keygen"], errors);
}

fn validate_component_ui(owner: &Path, manifest: &ComponentManifest, errors: &mut Vec<String>) {
    validate_menu(owner, "ui.menu", &manifest.ui.menu, errors);

    let mut required = Vec::new();
    if manifest.context.archived {
        required.push("archived");
    }
    if manifest.operations.build.handler == "paddle-ocr" {
        required.push("build");
    }
    validate_prompt_map(owner, &manifest.ui.prompts, &required, errors);
}

fn validate_vocabulary(owner: &Path, vocabulary: &UiVocabulary, errors: &mut Vec<String>) {
    validate_nonempty("ui.vocabulary.usage", &vocabulary.usage, owner, errors);
    validate_nonempty(
        "ui.vocabulary.requires",
        &vocabulary.requires,
        owner,
        errors,
    );
    validate_nonempty(
        "ui.vocabulary.commands",
        &vocabulary.commands,
        owner,
        errors,
    );
}

fn validate_menu(owner: &Path, name: &str, menu: &UiMenu, errors: &mut Vec<String>) {
    validate_nonempty(&format!("{name}.title"), &menu.title, owner, errors);
    validate_nonempty(&format!("{name}.usage"), &menu.usage, owner, errors);
}


fn validate_screen(owner: &Path, name: &str, screen: &UiScreen, errors: &mut Vec<String>) {
    validate_nonempty(&format!("{name}.title"), &screen.title, owner, errors);
    if let Some(usage) = &screen.usage {
        validate_nonempty(&format!("{name}.usage"), usage, owner, errors);
    }
    if let Some(description) = &screen.description {
        validate_nonempty(&format!("{name}.description"), description, owner, errors);
    }
    for requirement in &screen.requirements {
        validate_nonempty(
            &format!("{name}.requirements entry"),
            &requirement.text,
            owner,
            errors,
        );
        if let Some(link) = &requirement.link {
            validate_nonempty(
                &format!("{name}.requirements link label"),
                &link.label,
                owner,
                errors,
            );
            if !(link.url.starts_with("https://") || link.url.starts_with("http://")) {
                errors.push(format!(
                    "{}: {name}.requirements link must use http or https",
                    owner.display()
                ));
            }
        }
    }
    if let Some(section) = &screen.section {
        validate_nonempty(
            &format!("{name}.section.title"),
            &section.title,
            owner,
            errors,
        );
        if section.entries.is_empty() {
            errors.push(format!(
                "{}: {name}.section.entries may not be empty",
                owner.display()
            ));
        }
        for (index, entry) in section.entries.iter().enumerate() {
            validate_nonempty(
                &format!("{name}.section.entries[{index}].label"),
                &entry.label,
                owner,
                errors,
            );
            validate_nonempty(
                &format!("{name}.section.entries[{index}].description"),
                &entry.description,
                owner,
                errors,
            );
        }
    }
}

fn validate_prompt_map(
    owner: &Path,
    prompts: &std::collections::BTreeMap<String, UiPrompt>,
    required: &[&str],
    errors: &mut Vec<String>,
) {
    for route in required {
        if !prompts.contains_key(*route) {
            errors.push(format!(
                "{}: ui.prompts.{route} is required",
                owner.display()
            ));
        }
    }
    for (route, prompt) in prompts {
        if !required.contains(&route.as_str()) {
            errors.push(format!(
                "{}: unknown UI prompt route '{route}'",
                owner.display()
            ));
        }
        validate_prompt(owner, &format!("ui.prompts.{route}"), prompt, errors);
    }
}

fn validate_prompt(owner: &Path, name: &str, prompt: &UiPrompt, errors: &mut Vec<String>) {
    if let Some(title) = &prompt.title {
        validate_nonempty(&format!("{name}.title"), title, owner, errors);
    }
    if let Some(description) = &prompt.description {
        validate_nonempty(&format!("{name}.description"), description, owner, errors);
    }
    validate_nonempty(&format!("{name}.question"), &prompt.question, owner, errors);
    if let Some(declined) = &prompt.declined {
        validate_nonempty(&format!("{name}.declined"), declined, owner, errors);
    }

    let placeholders = Regex::new(r"\{([^{}]+)\}").expect("UI placeholder regex is valid");
    for capture in placeholders.captures_iter(&prompt.question) {
        if &capture[1] != "version" {
            errors.push(format!(
                "{}: {name}.question uses unknown placeholder '{{{}}}'",
                owner.display(),
                &capture[1]
            ));
        }
    }
}

pub fn validate_uniqueness(components: &[Component], errors: &mut Vec<String>) {
    let mut names: HashMap<(Category, &str), &Path> = HashMap::new();
    let mut orders: HashMap<(Category, u32), &Path> = HashMap::new();
    for component in components {
        let name_key = (component.category(), component.name());
        if let Some(previous) = names.insert(name_key, &component.manifest_path) {
            errors.push(format!(
                "duplicate component name '{}:{}' in {} and {}",
                component.category().label(),
                component.name(),
                previous.display(),
                component.manifest_path.display()
            ));
        }
        let order_key = (component.category(), component.manifest.context.order);
        if let Some(previous) = orders.insert(order_key, &component.manifest_path) {
            errors.push(format!(
                "duplicate component order '{}:{}' in {} and {}",
                component.category().label(),
                component.manifest.context.order,
                previous.display(),
                component.manifest_path.display()
            ));
        }
    }
}

pub fn validate_release_config(owner: &Path, template: &str, errors: &mut Vec<String>) {
    if template.matches("{version}").count() != 1 {
        errors.push(format!(
            "{}: release.tag must contain exactly one '{{version}}' placeholder",
            owner.display()
        ));
    }
    if template.trim() != template || template.contains(char::is_whitespace) {
        errors.push(format!(
            "{}: release.tag may not contain whitespace",
            owner.display()
        ));
    }
}

pub fn validate_nonempty(field: &str, value: &str, owner: &Path, errors: &mut Vec<String>) {
    if value.trim().is_empty() {
        errors.push(format!("{}: {field} may not be empty", owner.display()));
    }
}

pub fn validate_slug(field: &str, value: &str, owner: &Path, errors: &mut Vec<String>) {
    validate_nonempty(field, value, owner, errors);
    let valid = !value.is_empty()
        && value.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
        && value
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_alphanumeric())
        && value
            .chars()
            .last()
            .is_some_and(|character| character.is_ascii_alphanumeric());
    if !valid {
        errors.push(format!(
            "{}: {field} must be a lowercase kebab-case slug",
            owner.display()
        ));
    }
}

pub fn read_version(base: &Path, config: &VersionConfig) -> Result<Option<String>, String> {
    if config.scheme == VersionScheme::None {
        return Ok(None);
    }
    let source = config
        .source
        .as_ref()
        .ok_or_else(|| "version.source is required".to_string())?;
    let path = base.join(&source.path);
    let body = fs::read_to_string(&path)
        .map_err(|error| format!("Could not read version source {}: {error}", path.display()))?;
    let value = match source.format {
        VersionFormat::Plain => body.trim().to_string(),
        VersionFormat::Json => {
            let document: serde_json::Value = serde_json::from_str(&body).map_err(|error| {
                format!("Invalid JSON version source {}: {error}", path.display())
            })?;
            json_value_at(&document, source.key.as_deref().unwrap_or_default())?
        }
        VersionFormat::Toml => {
            let document: toml::Value = toml::from_str(&body).map_err(|error| {
                format!("Invalid TOML version source {}: {error}", path.display())
            })?;
            toml_value_at(&document, source.key.as_deref().unwrap_or_default())?
        }
        VersionFormat::Regex => {
            let pattern = source.pattern.as_deref().unwrap_or_default();
            let regex = Regex::new(pattern).map_err(|error| {
                format!("Invalid version regex for {}: {error}", path.display())
            })?;
            regex
                .captures(&body)
                .and_then(|captures| captures.name("version"))
                .map(|capture| capture.as_str().to_string())
                .ok_or_else(|| format!("Version pattern did not match {}", path.display()))?
        }
    };
    if value.trim().is_empty() {
        Err(format!(
            "Version source {} produced an empty value",
            path.display()
        ))
    } else {
        Ok(Some(value))
    }
}

pub fn json_value_at(document: &serde_json::Value, key: &str) -> Result<String, String> {
    let mut value = document;
    for segment in key.split('.') {
        value = value
            .get(segment)
            .ok_or_else(|| format!("JSON version key '{key}' was not found"))?;
    }
    value
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| format!("JSON version key '{key}' is not a string"))
}

pub fn toml_value_at(document: &toml::Value, key: &str) -> Result<String, String> {
    let mut value = document;
    for segment in key.split('.') {
        value = value
            .get(segment)
            .ok_or_else(|| format!("TOML version key '{key}' was not found"))?;
    }
    value
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| format!("TOML version key '{key}' is not a string"))
}

pub fn format_validation_errors(mut errors: Vec<String>) -> String {
    errors.sort();
    errors.dedup();
    format!(
        "xtask registry validation failed:\n{}",
        errors
            .into_iter()
            .map(|error| format!("  - {error}"))
            .collect::<Vec<_>>()
            .join("\n")
    )
}
