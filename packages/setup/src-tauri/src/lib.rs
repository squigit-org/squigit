use std::path::PathBuf;
use tauri::Manager;

#[derive(serde::Serialize)]
struct SystemStatus {
    os: String,
    is_installed: bool,
    detected_path: Option<String>,
}

#[tauri::command]
fn get_system_status(app: tauri::AppHandle) -> SystemStatus {
    let os = std::env::consts::OS.to_string();
    
    // 1. Resolve paths based on YOUR Blueprint
    let check_path = match os.as_str() {
        "windows" => {
            // Blueprint: %LOCALAPPDATA%\Programs\Spatialshot\daemon.exe
            // Tauri's local_data_dir() resolves to %LOCALAPPDATA%
            app.path().local_data_dir().unwrap_or_default()
                .join("Programs")
                .join("Spatialshot")
                .join("daemon.exe")
        },
        "macos" => {
            // Blueprint: /Applications/Spatialshot.app/Contents/MacOS/daemon
            PathBuf::from("/Applications/Spatialshot.app/Contents/MacOS/daemon")
        },
        _ => { // Linux
            // Blueprint: $HOME/.local/share/spatialshot/daemon
            // Tauri's data_local_dir() usually resolves to $HOME/.local/share on Linux
            app.path().data_local_dir().unwrap_or_default()
                .join("spatialshot")
                .join("daemon")
        },
    };

    let is_installed = check_path.exists();
    let detected_path = if is_installed {
        Some(check_path.display().to_string())
    } else {
        None
    };

    // Return the specific OS key for your markdown files
    let os_key = match os.as_str() {
        "windows" => "win32",
        "macos" => "macos",
        _ => "linux",
    };

    SystemStatus {
        os: os_key.to_string(),
        is_installed,
        detected_path,
    }
}

#[tauri::command]
async fn show_wizard_window(window: tauri::Window) {
    // 2. The React app calls this when it's visually ready
    window.show().unwrap();
    window.set_focus().unwrap();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    // 3. Register both commands
    .invoke_handler(tauri::generate_handler![get_system_status, show_wizard_window])
    .setup(|app| {
        // We still center the window here, but we DO NOT show it yet.
        if let Some(window) = app.get_webview_window("main") {
            if let Ok(Some(monitor)) = window.current_monitor() {
                let screen_size = monitor.size();
                let monitor_pos = monitor.position();
                let width = 730;
                let height = 580;
                
                let x = monitor_pos.x + ((screen_size.width as i32 - width as i32) / 2);
                let y = monitor_pos.y + ((screen_size.height as i32 - height as i32) / 2);

                // Force size and position, but keep hidden
                let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: width as u32, height: height as u32 }));
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
            }
        }
        Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}