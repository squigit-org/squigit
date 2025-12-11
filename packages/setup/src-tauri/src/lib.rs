use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const HOTKEY_SCRIPT_LINUX: &str = include_str!("scripts/hotkey.sh");
const MACOS_PLIST_TEMPLATE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.spatialshot.daemon</string>
    <key>ProgramArguments</key>
    <array><string>/Applications/Spatialshot.app/Contents/MacOS/daemon</string></array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardErrorPath</key><string>/tmp/spatialshot.daemon.err</string>
</dict>
</plist>"#;

const BASE_URL: &str = "https://github.com/a7mddra/spatialshot/releases/latest/download";

#[derive(serde::Serialize, Clone)]
struct ProgressPayload {
    status: String,
    percentage: f32,
}

#[derive(serde::Serialize)]
struct SystemStatus {
    os: String,
    arch: String,
    is_installed: bool,
    home_dir: String,
}

#[cfg(not(target_os = "linux"))]
fn kill_daemon_if_running() -> bool {
    use interprocess::local_socket::LocalSocketStream;
    use std::io::Write;

    let name_str = if cfg!(windows) { "\\\\.\\pipe\\spatialshot_ipc_secret_v1" } else { "/tmp/spatialshot.ipc.sock" };
    
    // FIX: Pass the string directly to connect(). 
    // In interprocess 1.x, the Result of to_local_socket_name() cannot be passed to connect().
    if let Ok(mut conn) = LocalSocketStream::connect(name_str) {
        if conn.write_all(b"EXECUTE_ORDER_66\n").is_ok() {
            std::thread::sleep(Duration::from_millis(1000));
            return true;
        }
    }
    false
}

#[cfg(target_os = "linux")]
fn kill_daemon_if_running() -> bool { false }

fn manage_daemon_macos(action: &str) {
    if let Some(home) = dirs::home_dir() {
        let plist_path = home.join("Library/LaunchAgents/com.spatialshot.daemon.plist");
        let _ = Command::new("launchctl").args([action, "-w", plist_path.to_str().unwrap()]).output();
    }
}

fn create_backup(target: &Path) -> Option<PathBuf> {
    if !target.exists() { return None; }
    if let Ok(temp_dir) = tempfile::tempdir() {
        // FIX: Use keep() instead of deprecated into_path()
        if let Ok(backup_path) = temp_dir.keep() {
            let opts = fs_extra::dir::CopyOptions::new().content_only(false);
            if fs_extra::dir::copy(target, &backup_path, &opts).is_ok() {
                return Some(backup_path.join(target.file_name().unwrap()));
            }
        }
    }
    None
}

fn restore_backup(backup: &Path, target: &Path) {
    if backup.exists() {
        if target.exists() { let _ = fs::remove_dir_all(target); }
        let opts = fs_extra::dir::CopyOptions::new().content_only(true);
        let _ = fs_extra::dir::move_dir(backup, target.parent().unwrap(), &opts);
    }
}

fn download_file(url: &str, dest: &Path, app: &AppHandle, start_pct: f32, end_pct: f32) -> Result<(), String> {
    let client = reqwest::blocking::Client::new();
    let mut response = client.get(url).send().map_err(|e| e.to_string())?;
    let total_size = response.content_length().unwrap_or(10 * 1024 * 1024);
    
    let mut file = File::create(dest).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut buffer = [0; 8192];

    while let Ok(n) = response.read(&mut buffer) {
        if n == 0 { break; }
        file.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
        downloaded += n as u64;
        
        if downloaded % (512 * 1024) == 0 {
            let ratio = downloaded as f32 / total_size as f32;
            let current = start_pct + (ratio * (end_pct - start_pct));
            let _ = app.emit("install-progress", ProgressPayload { 
                status: format!("Downloading... {:.1}MB", downloaded as f32/1e6), percentage: current 
            });
        }
    }
    Ok(())
}

fn unzip_entry(zip_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = dest_dir.join(file.mangled_name());

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() { fs::create_dir_all(p).ok(); }
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Some(mode) = file.unix_mode() {
                let _ = fs::set_permissions(&outpath, fs::Permissions::from_mode(mode));
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn start_installation(app: AppHandle, os: String, arch: String) -> Result<(), String> {
    let target_path = if os == "macos" { 
        PathBuf::from("/Applications/Spatialshot.app") 
    } else { 
        dirs::home_dir().unwrap().join(".local/share/spatialshot") 
    };

    let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
    let temp_path = temp_dir.path().to_path_buf();
    
    app.emit("install-progress", ProgressPayload { status: "Creating backup...".into(), percentage: 5.0 }).ok();
    let backup = create_backup(&target_path);

    match install_logic(&app, &os, &arch, &temp_path).await {
        Ok(_) => {
            if os == "macos" { manage_daemon_macos("load"); }
            app.emit("install-progress", ProgressPayload { status: "Done!".into(), percentage: 100.0 }).ok();
            Ok(())
        }
        Err(e) => {
            app.emit("install-progress", ProgressPayload { status: "Error! Rolling back...".into(), percentage: 99.0 }).ok();
            if let Some(b) = backup {
                restore_backup(&b, &target_path);
                if os == "macos" { manage_daemon_macos("load"); }
            }
            Err(e)
        }
    }
}

async fn install_logic(app: &AppHandle, os: &str, arch: &str, temp: &Path) -> Result<(), String> {
    let zip_suffix = if os == "macos" { "mac" } else { "linux" };
    let files = vec![
        (format!("spatialshot-{}-{}.zip", zip_suffix, arch), 10.0, 30.0),
        (format!("capture-{}-{}.zip", zip_suffix, arch), 30.0, 45.0),
        (format!("daemon-{}-{}.zip", zip_suffix, arch), 45.0, 50.0),
        (format!("spatialshot-setup-{}-{}.zip", zip_suffix, arch), 50.0, 60.0),
    ];

    for (name, s, e) in &files {
        download_file(&format!("{}/{}", BASE_URL, name), &temp.join(name), app, *s, *e)?;
    }

    app.emit("install-progress", ProgressPayload { status: "Stopping services...".into(), percentage: 65.0 }).ok();
    if os == "macos" { manage_daemon_macos("unload"); }
    kill_daemon_if_running();

    if os == "macos" {
        install_macos(app, temp, &files)?;
    } else {
        install_linux(app, temp, &files)?;
    }
    
    Ok(())
}

fn install_macos(app: &AppHandle, temp: &Path, files: &Vec<(String, f32, f32)>) -> Result<(), String> {
    app.emit("install-progress", ProgressPayload { status: "Assembling Bundle...".into(), percentage: 70.0 }).ok();

    unzip_entry(&temp.join(&files[0].0), temp)?; 
    let bundle = temp.join("Spatialshot.app");
    if !bundle.exists() { return Err("Bundle missing".into()); }
    
    let res = bundle.join("Contents/Resources");
    let macos = bundle.join("Contents/MacOS");
    fs::create_dir_all(res.join("Capture")).ok();
    
    unzip_entry(&temp.join(&files[1].0), &res.join("Capture"))?;
    unzip_entry(&temp.join(&files[2].0), &macos)?;

    let _ = Command::new("chmod").args(["+x", macos.join("daemon").to_str().unwrap()]).output();
    let _ = Command::new("chmod").args(["+x", res.join("Capture/capture").to_str().unwrap()]).output();
    let _ = Command::new("xattr").args(["-cr", bundle.to_str().unwrap()]).output();

    app.emit("install-progress", ProgressPayload { status: "Installing...".into(), percentage: 85.0 }).ok();
    let target = PathBuf::from("/Applications/Spatialshot.app");
    if target.exists() { let _ = fs::remove_dir_all(&target); }
    let opts = fs_extra::dir::CopyOptions::new().content_only(true);
    fs_extra::dir::move_dir(&bundle, "/Applications/", &opts).map_err(|e| e.to_string())?;

    if let Some(home) = dirs::home_dir() {
        let agent_dir = home.join("Library/LaunchAgents");
        fs::create_dir_all(&agent_dir).ok();
        fs::write(agent_dir.join("com.spatialshot.daemon.plist"), MACOS_PLIST_TEMPLATE).ok();

        let update_dir = home.join("Library/Application Support/Spatialshot/updates");
        fs::create_dir_all(&update_dir).ok();
        unzip_entry(&temp.join(&files[3].0), &update_dir)?;
    }

    Ok(())
}

fn install_linux(app: &AppHandle, temp: &Path, files: &Vec<(String, f32, f32)>) -> Result<(), String> {
    app.emit("install-progress", ProgressPayload { status: "Building structure...".into(), percentage: 70.0 }).ok();

    let build = temp.join("build");
    fs::create_dir_all(&build).ok();
    
    unzip_entry(&temp.join(&files[0].0), &build.join("app"))?;
    unzip_entry(&temp.join(&files[1].0), &build.join("capture"))?;
    unzip_entry(&temp.join(&files[2].0), &build)?;

    let _ = Command::new("chmod").args(["+x", build.join("daemon").to_str().unwrap()]).output();
    let _ = Command::new("chmod").args(["+x", build.join("capture/capture").to_str().unwrap()]).output();
    let _ = Command::new("chmod").args(["+x", build.join("app/spatialshot").to_str().unwrap()]).output();

    let home = dirs::home_dir().unwrap();
    let target = home.join(".local/share/spatialshot");
    if target.exists() { let _ = fs::remove_dir_all(&target); }
    fs::create_dir_all(target.parent().unwrap()).ok();
    
    let opts = fs_extra::dir::CopyOptions::new().content_only(true);
    fs_extra::dir::move_dir(&build, &target, &opts).map_err(|e| e.to_string())?;

    let update_dir = home.join(".config/spatialshot/updates");
    fs::create_dir_all(&update_dir).ok();
    unzip_entry(&temp.join(&files[3].0), &update_dir)?; 

    #[cfg(target_os = "linux")]
    {
        app.emit("install-progress", ProgressPayload { status: "Registering keys...".into(), percentage: 95.0 }).ok();
        let script = temp.join("hotkey.sh");
        fs::write(&script, HOTKEY_SCRIPT_LINUX).ok();
        let _ = Command::new("chmod").args(["+x", script.to_str().unwrap()]).output();
        let _ = Command::new("bash").arg(script).arg("install").arg(target.join("daemon")).output();
    }
    Ok(())
}

#[tauri::command]
fn get_system_status() -> SystemStatus {
    let os = std::env::consts::OS.to_string();
    let arch_raw = std::env::consts::ARCH;
    let arch = if arch_raw == "aarch64" { "arm64" } else { "x64" };
    
    let check_path = if os == "macos" {
        PathBuf::from("/Applications/Spatialshot.app/Contents/MacOS/daemon")
    } else {
        dirs::home_dir().unwrap_or_default().join(".local/share/spatialshot/daemon")
    };

    SystemStatus {
        os,
        arch: arch.to_string(),
        is_installed: check_path.exists(),
        home_dir: dirs::home_dir().unwrap_or_default().display().to_string(),
    }
}

#[tauri::command]
async fn show_wizard_window(window: tauri::Window) { window.show().unwrap(); window.set_focus().unwrap(); }
#[tauri::command]
async fn close_wizard(window: tauri::Window) { window.close().unwrap(); }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_system_status,
            start_installation,
            show_wizard_window,
            close_wizard
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
