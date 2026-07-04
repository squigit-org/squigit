use crate::registry::Component;
use crate::{Runtime, XtaskResult};
use std::fs;
use std::path::Path;

pub fn run(runtime: &Runtime, component: &Component) -> XtaskResult {
    match component.name() {
        "renderer" => remove(runtime, &component.directory.join("dist"))?,
        "desktop" => {
            remove(runtime, &component.directory.join("dist"))?;
            remove(runtime, &component.directory.join("binaries"))?;
        }
        "cli" => {
            remove(runtime, &component.directory.join("dist"))?;
            remove_generated_node_files(runtime, &component.directory.join("src/addon"))?;
        }
        name => return Err(format!("unknown application clean target '{name}'")),
    }
    runtime.success(&format!("Cleaned {}.", component.display_name()));
    Ok(())
}

fn remove_generated_node_files(runtime: &Runtime, directory: &Path) -> XtaskResult {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Could not read {}: {error}", directory.display())),
    };
    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "Could not read an entry in {}: {error}",
                directory.display()
            )
        })?;
        let path = entry.path();
        if path
            .extension()
            .is_some_and(|extension| extension == "node")
        {
            remove(runtime, &path)?;
        }
    }
    Ok(())
}

fn remove(runtime: &Runtime, path: &Path) -> XtaskResult {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Could not inspect {}: {error}", path.display())),
    };
    println!("  Removing {}", runtime.relative_path(path));
    if metadata.is_dir() && !metadata.file_type().is_symlink() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
    .map_err(|error| format!("Could not remove {}: {error}", path.display()))
}
