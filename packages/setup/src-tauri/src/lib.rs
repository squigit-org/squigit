use std::path::PathBuf;
use tauri::Manager;

#[derive(serde::Serialize)]
struct SystemStatus {
    os: String,
    arch: String,
    is_installed: bool,
    detected_path: Option<String>,
    home_dir: String,
}

#[tauri::command]
fn get_system_status(app: tauri::AppHandle) -> SystemStatus {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH; // "x86_64" or "aarch64"

    let home_dir = dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "$HOME".to_string());

    // Unix-only logic
    let check_path = if os == "macos" {
         PathBuf::from("/Applications/Spatialshot.app/Contents/MacOS/daemon")
    } else {
        // Linux: Check ~/.local/share/spatialshot/daemon
        app.path().local_data_dir().unwrap_or_default()
            .join("spatialshot")
            .join("daemon")
    };

    let is_installed = check_path.exists();
    let detected_path = if is_installed {
        Some(check_path.display().to_string())
    } else {
        None
    };

    // Normalize Arch key for filenames
    let arch_key = match arch {
        "aarch64" => "arm64",
        _ => "x64",
    };

    SystemStatus {
        os: os.to_string(), // "macos" or "linux"
        arch: arch_key.to_string(),
        is_installed,
        detected_path,
        home_dir,
    }
}

#[tauri::command]
async fn show_wizard_window(window: tauri::Window) {
    window.show().unwrap();
    window.set_focus().unwrap();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![get_system_status, show_wizard_window])
    .setup(|app| {
        if let Some(window) = app.get_webview_window("main") {
            if let Ok(Some(monitor)) = window.current_monitor() {
                let screen_size = monitor.size();
                let monitor_pos = monitor.position();
                let width = 730;
                let height = 580;
                
                let x = monitor_pos.x + ((screen_size.width as i32 - width as i32) / 2);
                let y = monitor_pos.y + ((screen_size.height as i32 - height as i32) / 2);

                let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: width as u32, height: height as u32 }));
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
            }
        }
        Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}