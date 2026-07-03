use crate::registry::manifest::{Operation, VersionScheme};
use crate::registry::Registry;
use crate::{components, workspace, Runtime};
use semver::Version;

pub fn run(runtime: &Runtime, registry: &Registry, args: &[String]) -> i32 {
    if registry.is_repository() {
        if !args.is_empty() {
            return super::fail(runtime, "repository CalVer bump does not accept a version.");
        }
        let version = runtime.today_calver();
        let files = registry.bump_files(None);
        return match workspace::release::bump_root(runtime, &version, &files) {
            Ok(()) => 0,
            Err(error) => super::fail(runtime, &error),
        };
    }

    let component = match super::component_operation(runtime, registry, Operation::Bump) {
        Ok(component) => component,
        Err(code) => return code,
    };
    let version = match component.manifest.version.scheme {
        VersionScheme::Semver => {
            let [version] = args else {
                return super::fail(runtime, "SemVer bump requires exactly one VERSION.");
            };
            if Version::parse(version).is_err() {
                return super::fail(runtime, &format!("'{version}' is not valid SemVer."));
            }
            version.clone()
        }
        VersionScheme::Calver => {
            if !args.is_empty() {
                return super::fail(runtime, "CalVer bump does not accept a version.");
            }
            runtime.today_calver()
        }
        VersionScheme::None => {
            return super::fail(runtime, "This component is not versioned.");
        }
    };
    let files = registry.bump_files(Some(component));
    match components::bump(runtime, component, &version, &files) {
        Ok(()) => 0,
        Err(error) => super::fail(runtime, &error),
    }
}
