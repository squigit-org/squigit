use base64::{engine::general_purpose, Engine as _};
use parking_lot::Mutex;
use std::fs::File;
use std::io::Read;
use tauri::Manager;
use tauri_plugin_cli::CliExt;
use tauri_plugin_opener::OpenerExt;

// 1. App State
pub struct AppState {
    pub image_data: Mutex<Option<String>>,
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

    // Update state
    let mut image_lock = state.image_data.lock();
    *image_lock = Some(data_url.clone());

    Ok(data_url)
}

// --- Image Commands ---

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

// Re-use logic for reading a file without necessarily setting it as "startup" image
#[tauri::command]
fn read_image_file(path: String, _state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
     // reuse the helper to get base64
    let mut file = File::open(&path).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
    
    let mime_type = image::guess_format(&buffer).map(|f| f.to_mime_type()).unwrap_or("image/jpeg");
    let base64 = general_purpose::STANDARD.encode(&buffer);
    let data_url = format!("data:{};base64,{}", mime_type, base64);
    
    // Return object matching React interface
    Ok(serde_json::json!({
        "base64": data_url,
        "mimeType": mime_type
    }))
}


// --- Stub Commands (Missing functionality placeholders) ---

#[tauri::command]
fn get_api_key() -> Result<String, String> {
    Ok("dummy-api-key-12345".to_string())
}

#[tauri::command]
fn get_prompt() -> Result<String, String> {
    Ok("You are a helpful AI.".to_string())
}

#[tauri::command]
fn save_prompt(prompt: String) -> Result<(), String> {
    println!("Backend: Saving prompt -> {}", prompt);
    Ok(())
}

#[tauri::command]
fn reset_prompt() -> Result<String, String> {
    Ok("You are a helpful AI.".to_string())
}

#[tauri::command]
fn get_model() -> Result<String, String> {
    Ok("gemini-2.5-flash".to_string())
}

#[tauri::command]
fn save_model(model: String) -> Result<(), String> {
    println!("Backend: Saving model -> {}", model);
    Ok(())
}

#[tauri::command]
fn reset_model() -> Result<String, String> {
    Ok("gemini-2.5-flash".to_string())
}

#[tauri::command]
fn get_user_data() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "name": "Demo User",
        "email": "demo@spatialshot.ai",
        "avatar": "https://api.dicebear.com/7.x/avataaars/svg?seed=Spatial"
    }))
}

#[tauri::command]
fn get_session_path() -> Result<Option<String>, String> {
    // Return None so it doesn't try to load an old file on startup
    Ok(None)
}

#[tauri::command]
fn set_theme(theme: String) {
    println!("Backend: Theme set to {}", theme);
}

#[tauri::command]
fn logout() {
    println!("Backend: User logged out");
}

#[tauri::command]
fn reset_api_key() {
    println!("Backend: API Key reset");
}

#[tauri::command]
fn clear_cache() {
    println!("Backend: Cache cleared");
}

#[tauri::command]
fn trigger_lens_search() {
    println!("Backend: Triggering Google Lens...");
}

#[tauri::command]
fn open_external_url(app: tauri::AppHandle, url: String) {
    // FIX: Use open_url with None for the 'with' argument
    let _ = app.opener().open_url(url, None::<&str>);
}

// --- Entry Point ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        image_data: Mutex::new(None),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_cli::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .setup(|app| {
            // Handle CLI Args
            match app.cli().matches() {
                Ok(matches) => {
                    if let Some(arg_data) = matches.args.get("image") {
                        if let Some(path_str) = arg_data.value.as_str() {
                            println!("CLI Image Path Found: {}", path_str);
                            let state: tauri::State<AppState> = app.state();
                            // We ignore result here as we just want to try loading it
                            let _ = process_and_store_image(path_str, &state);
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
            get_current_image,
            read_image_file,
            get_api_key,
            get_prompt,
            save_prompt,
            reset_prompt,
            get_model,
            save_model,
            reset_model,
            get_user_data,
            get_session_path,
            set_theme,
            logout,
            reset_api_key,
            clear_cache,
            trigger_lens_search,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}