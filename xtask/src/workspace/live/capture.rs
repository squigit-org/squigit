use crate::{Runtime, XtaskResult};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const BUILD_TIP: &str = "Run 'cargo xtask build --native' from sidecars/qt-capture.";

#[derive(Clone, Copy)]
enum HostPlatform {
    Linux,
    Macos,
    Windows,
}

#[derive(Default)]
struct CaptureProtocol {
    success: bool,
    failed: bool,
    denied: bool,
    path: Option<PathBuf>,
}

pub fn run(runtime: &Runtime, mode: &str) -> XtaskResult {
    let flag = native_mode_flag(mode)?;
    let binary = find_native_binary(runtime)?;
    let output = Command::new(&binary)
        .arg(flag)
        .stdin(Stdio::inherit())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .output()
        .map_err(|error| {
            format!(
                "Could not launch Qt Capture native binary {}: {error}",
                runtime.relative_path(&binary)
            )
        })?;
    let protocol = parse_capture_protocol(&output.stdout);

    if protocol.denied {
        return Err("Qt Capture was denied screen-recording permission.".to_string());
    }
    if protocol.failed {
        return Err("Qt Capture was cancelled or failed.".to_string());
    }
    if !output.status.success() {
        let status = output.status.code().map_or_else(
            || "by a signal".to_string(),
            |code| format!("with exit code {code}"),
        );
        return Err(format!("Qt Capture native process exited {status}."));
    }
    if !protocol.success {
        return Err(
            "Qt Capture exited successfully without CAPTURE_SUCCESS protocol output.".to_string(),
        );
    }

    let path = protocol.path.ok_or_else(|| {
        "Qt Capture reported success without an absolute capture path.".to_string()
    })?;
    if !path.is_file() {
        return Err(format!(
            "Qt Capture reported {}, but the PNG does not exist.",
            path.display()
        ));
    }

    runtime.success(&format!("Live {mode} capture passed."));
    let label = path.display().to_string();
    println!(
        "  image: {}",
        runtime.console.link(&label, &file_url(&path))
    );
    Ok(())
}

fn native_mode_flag(mode: &str) -> XtaskResult<&'static str> {
    match mode {
        "traditional" => Ok("--traditional"),
        "squiggle" => Ok("--squiggle"),
        _ => Err(format!(
            "Unknown Qt Capture mode '{mode}'; expected traditional or squiggle."
        )),
    }
}

fn find_native_binary(runtime: &Runtime) -> XtaskResult<PathBuf> {
    let platform = host_platform().ok_or_else(|| {
        "Qt Capture live tests are unsupported on this operating system.".to_string()
    })?;
    let candidates = native_binary_candidates_for(&runtime.repo_root, platform);

    if let Some(binary) = candidates.iter().find(|path| path.is_file()) {
        return Ok(binary.clone());
    }

    let expected = candidates
        .iter()
        .map(|path| runtime.relative_path(path))
        .collect::<Vec<_>>()
        .join(" or ");
    Err(format!(
        "Qt Capture native binary not found. Expected {expected}.\n{BUILD_TIP}"
    ))
}

fn host_platform() -> Option<HostPlatform> {
    if cfg!(target_os = "linux") {
        Some(HostPlatform::Linux)
    } else if cfg!(target_os = "macos") {
        Some(HostPlatform::Macos)
    } else if cfg!(target_os = "windows") {
        Some(HostPlatform::Windows)
    } else {
        None
    }
}

fn native_binary_candidates_for(repo_root: &Path, platform: HostPlatform) -> Vec<PathBuf> {
    let build_dir = repo_root.join("sidecars/qt-capture/native/build");
    match platform {
        HostPlatform::Linux => vec![build_dir.join("capture-bin")],
        HostPlatform::Macos => vec![build_dir.join("capture.app/Contents/MacOS/capture")],
        HostPlatform::Windows => vec![
            build_dir.join("capture.exe"),
            build_dir.join("Release/capture.exe"),
        ],
    }
}

fn parse_capture_protocol(stdout: &[u8]) -> CaptureProtocol {
    let mut protocol = CaptureProtocol::default();
    for line in String::from_utf8_lossy(stdout).lines() {
        let line = line.trim();
        match line {
            "CAPTURE_SUCCESS" => protocol.success = true,
            "CAPTURE_FAIL" => protocol.failed = true,
            "CAPTURE_DENIED" => protocol.denied = true,
            _ if protocol.success && protocol.path.is_none() && is_capture_path_line(line) => {
                protocol.path = Some(PathBuf::from(line));
            }
            _ => {}
        }
    }
    protocol
}

fn is_capture_path_line(line: &str) -> bool {
    if line.starts_with('/') || line.starts_with("\\\\") {
        return true;
    }

    let bytes = line.as_bytes();
    bytes.len() > 2
        && bytes[1] == b':'
        && (bytes[2] == b'/' || bytes[2] == b'\\')
        && bytes[0].is_ascii_alphabetic()
}

fn file_url(path: &Path) -> String {
    let path = path
        .to_string_lossy()
        .replace('%', "%25")
        .replace(' ', "%20")
        .replace('#', "%23")
        .replace('\\', "/");
    if path.starts_with('/') {
        format!("file://{path}")
    } else {
        format!("file:///{path}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Console;

    #[test]
    fn resolves_native_binary_candidates_for_every_desktop_platform() {
        let root = Path::new("/repo");

        assert_eq!(
            native_binary_candidates_for(root, HostPlatform::Linux),
            vec![root.join("sidecars/qt-capture/native/build/capture-bin")]
        );
        assert_eq!(
            native_binary_candidates_for(root, HostPlatform::Macos),
            vec![root.join("sidecars/qt-capture/native/build/capture.app/Contents/MacOS/capture")]
        );
        assert_eq!(
            native_binary_candidates_for(root, HostPlatform::Windows),
            vec![
                root.join("sidecars/qt-capture/native/build/capture.exe"),
                root.join("sidecars/qt-capture/native/build/Release/capture.exe"),
            ]
        );
    }

    #[test]
    fn maps_only_the_new_native_mode_flags() {
        assert_eq!(native_mode_flag("traditional").unwrap(), "--traditional");
        assert_eq!(native_mode_flag("squiggle").unwrap(), "--squiggle");
        assert!(native_mode_flag("rectangle").is_err());
    }

    #[test]
    fn parses_successful_capture_protocol() {
        let protocol = parse_capture_protocol(
            b"AUDIO_MUTE\nAUDIO_UNMUTE\nCAPTURE_SUCCESS\nDISPLAY_GEO:0,0,1920,1080\n/tmp/capture.png\n",
        );

        assert!(protocol.success);
        assert!(!protocol.failed);
        assert!(!protocol.denied);
        assert_eq!(protocol.path, Some(PathBuf::from("/tmp/capture.png")));
    }

    #[test]
    fn parses_denied_and_cancelled_protocol() {
        let denied = parse_capture_protocol(b"CAPTURE_DENIED\n");
        assert!(denied.denied);

        let cancelled = parse_capture_protocol(b"CAPTURE_FAIL\n");
        assert!(cancelled.failed);
    }

    #[test]
    fn encodes_clickable_file_urls() {
        assert_eq!(
            file_url(Path::new("/tmp/capture 100%#1.png")),
            "file:///tmp/capture%20100%25%231.png"
        );
        assert_eq!(
            file_url(Path::new(r"C:\Temp\capture image.png")),
            "file:///C:/Temp/capture%20image.png"
        );
    }

    #[test]
    fn missing_binary_error_includes_build_tip() {
        let root = tempfile::tempdir().unwrap();
        let runtime = Runtime {
            console: Console::plain(),
            repo_root: root.path().to_path_buf(),
            temp_root: root.path().join("tmp"),
        };

        let error = find_native_binary(&runtime).unwrap_err();
        assert!(error.contains("Qt Capture native binary not found"));
        assert!(error.contains(BUILD_TIP));
    }
}
