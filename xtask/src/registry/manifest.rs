use serde::Deserialize;
use std::collections::BTreeMap;

pub const SCHEMA_VERSION: u32 = 2;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ContextKind {
    Repository,
    Component,
}

#[derive(Debug, Deserialize)]
pub struct ManifestHeader {
    pub schema: u32,
    pub context: HeaderContext,
}

#[derive(Debug, Deserialize)]
pub struct HeaderContext {
    pub kind: ContextKind,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RootManifest {
    pub schema: u32,
    pub context: RootContext,
    pub discovery: DiscoveryConfig,
    pub version: VersionConfig,
    pub operations: RootOperations,
    pub ui: RootUi,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RootContext {
    pub kind: ContextKind,
    pub name: String,
    pub temp_namespace: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DiscoveryConfig {
    pub roots: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ComponentManifest {
    pub schema: u32,
    pub context: ComponentContext,
    pub requirements: Requirements,
    pub version: VersionConfig,
    pub release: Option<ReleaseConfig>,
    pub tests: TestsConfig,
    pub operations: ComponentOperations,
    pub ui: ComponentUi,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ComponentContext {
    pub kind: ContextKind,
    pub name: String,
    pub display_name: String,
    pub category: Category,
    pub order: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    Apps,
    Packages,
    Crates,
    Sidecars,
}

impl Category {
    pub const fn label(self) -> &'static str {
        match self {
            Self::Apps => "apps",
            Self::Packages => "packages",
            Self::Crates => "crates",
            Self::Sidecars => "sidecars",
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Requirements {
    pub node: bool,
    pub rust: bool,
    pub python: bool,
    pub cmake: bool,
    pub qt: bool,
}

impl Requirements {
    pub fn contains(&self, requirement: &str) -> Option<bool> {
        match requirement {
            "node" => Some(self.node),
            "rust" => Some(self.rust),
            "python" => Some(self.python),
            "cmake" => Some(self.cmake),
            "qt" => Some(self.qt),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VersionConfig {
    pub scheme: VersionScheme,
    pub files: Vec<String>,
    pub include_root: bool,
    pub source: Option<VersionSource>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VersionScheme {
    Semver,
    Calver,
    None,
}

impl VersionScheme {
    pub const fn label(self) -> &'static str {
        match self {
            Self::Semver => "SemVer",
            Self::Calver => "CalVer",
            Self::None => "unversioned",
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VersionSource {
    pub path: String,
    pub format: VersionFormat,
    pub key: Option<String>,
    pub pattern: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum VersionFormat {
    Plain,
    Json,
    Toml,
    Regex,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReleaseConfig {
    pub tag: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TestsConfig {
    pub root: String,
    pub include: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OperationConfig {
    pub enabled: bool,
    pub handler: String,
    pub description: String,
    #[serde(default)]
    pub requires_commit_sha: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ComponentOperations {
    pub dev: OperationConfig,
    pub doctor: OperationConfig,
    pub build: OperationConfig,
    pub test: OperationConfig,
    pub clean: OperationConfig,
    pub bump: OperationConfig,
    pub release: OperationConfig,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Operation {
    Dev,
    Doctor,
    Build,
    Test,
    Clean,
    Bump,
    Release,
}

impl Operation {
    pub const ALL: [Self; 7] = [
        Self::Dev,
        Self::Doctor,
        Self::Build,
        Self::Test,
        Self::Clean,
        Self::Bump,
        Self::Release,
    ];

    pub const fn name(self) -> &'static str {
        match self {
            Self::Dev => "dev",
            Self::Doctor => "doctor",
            Self::Build => "build",
            Self::Test => "test",
            Self::Clean => "clean",
            Self::Bump => "bump",
            Self::Release => "release",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|operation| operation.name() == value)
    }
}

impl ComponentOperations {
    pub const fn get(&self, operation: Operation) -> &OperationConfig {
        match operation {
            Operation::Dev => &self.dev,
            Operation::Doctor => &self.doctor,
            Operation::Build => &self.build,
            Operation::Test => &self.test,
            Operation::Clean => &self.clean,
            Operation::Bump => &self.bump,
            Operation::Release => &self.release,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RootOperations {
    pub dev: OperationConfig,
    pub doctor: OperationConfig,
    pub build: OperationConfig,
    pub test: OperationConfig,
    pub clean: OperationConfig,
    pub bump: OperationConfig,
    pub release: OperationConfig,
    pub live: OperationConfig,
    pub crypto: OperationConfig,
}

impl RootOperations {
    pub fn get(&self, command: &str) -> Option<&OperationConfig> {
        match command {
            "dev" => Some(&self.dev),
            "doctor" => Some(&self.doctor),
            "build" => Some(&self.build),
            "test" => Some(&self.test),
            "clean" => Some(&self.clean),
            "bump" => Some(&self.bump),
            "release" => Some(&self.release),
            "live" => Some(&self.live),
            "crypto" => Some(&self.crypto),
            _ => None,
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = (&'static str, &OperationConfig)> {
        [
            ("dev", &self.dev),
            ("doctor", &self.doctor),
            ("build", &self.build),
            ("test", &self.test),
            ("clean", &self.clean),
            ("bump", &self.bump),
            ("release", &self.release),
            ("live", &self.live),
            ("crypto", &self.crypto),
        ]
        .into_iter()
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UiVocabulary {
    pub usage: String,
    pub requires: String,
    pub commands: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UiMenu {
    pub title: String,
    pub usage: String,
    pub doc: Option<UiDoc>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UiDoc {
    pub path: String,
    pub topic: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UiEntry {
    pub label: String,
    pub description: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UiSection {
    pub title: String,
    pub entries: Vec<UiEntry>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UiLink {
    pub label: String,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UiRequirement {
    pub text: String,
    pub link: Option<UiLink>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UiScreen {
    pub title: String,
    pub usage: Option<String>,
    pub doc: Option<UiDoc>,
    #[serde(default)]
    pub requirements: Vec<UiRequirement>,
    pub description: Option<String>,
    pub section: Option<UiSection>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UiPrompt {
    pub title: Option<String>,
    pub description: Option<String>,
    pub question: String,
    pub declined: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RootUi {
    pub vocabulary: UiVocabulary,
    pub menu: UiMenu,
    #[serde(default)]
    pub screens: BTreeMap<String, UiScreen>,
    #[serde(default)]
    pub prompts: BTreeMap<String, UiPrompt>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ComponentUi {
    pub menu: UiMenu,
    #[serde(default)]
    pub prompts: BTreeMap<String, UiPrompt>,
}
