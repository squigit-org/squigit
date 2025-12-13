use base64::{engine::general_purpose, Engine as _};
use parking_lot::Mutex;
use std::fs::File;
use std::io::Read;
use tauri::Manager;
use tauri_plugin_cli::CliExt; // Import CLI extension

// 1. App State
pub struct AppState {
    pub image_data: Mutex<Option<String>>, // Stores: "data:image/png;base64,..."
}

// Helper: Read file -> Detect Mime -> Convert to Base64
fn process_and_store_image(path: &str, state: &tauri::State<AppState>) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    process_bytes_internal(buffer, state)
}

// Helper: Bytes -> Detect Mime -> Convert to Base64
fn process_bytes_internal(
    buffer: Vec<u8>,
    state: &tauri::State<AppState>,
) -> Result<String, String> {
    if buffer.is_empty() {
        return Err("Empty image buffer".to_string());
    }

    let mime_type = image::guess_format(&buffer)
        .map(|f| f.to_mime_type())
        .unwrap_or("image/jpeg");

    let base64_image = general_purpose::STANDARD.encode(&buffer);
    let data_url = format!("data:{};base64,{}", mime_type, base64_image);

    let mut image_lock = state.image_data.lock();
    *image_lock = Some(data_url.clone());

    Ok(data_url)
}

// --- Commands ---

#[tauri::command]
fn process_image_path(path: String, state: tauri::State<AppState>) -> Result<String, String> {
    process_and_store_image(&path, &state)
}

#[tauri::command]
fn process_image_bytes(bytes: Vec<u8>, state: tauri::State<AppState>) -> Result<String, String> {
    process_bytes_internal(bytes, &state)
}

#[tauri::command]
fn get_current_image(state: tauri::State<AppState>) -> Option<String> {
    state.image_data.lock().clone()
}

// --- Entry Point ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        image_data: Mutex::new(None),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init()) // Initialize CLI plugin
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .setup(|app| {
            // Check CLI args on startup
            match app.cli().matches() {
                Ok(matches) => {
                    // Check for the "image" argument defined in tauri.conf.json
                    if let Some(arg_data) = matches.args.get("image") {
                        if let Some(value) = &arg_data.value {
                            // Value is serde_json::Value, convert to string
                            if let Some(path_str) = value.as_str() {
                                println!("CLI Image Path Found: {}", path_str);
                                let state: tauri::State<AppState> = app.state();
                                let _ = process_and_store_image(path_str, &state);
                            }
                        }
                    }
                }
                Err(e) => println!("CLI Error: {}", e),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            process_image_path,
            process_image_bytes,
            get_current_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
