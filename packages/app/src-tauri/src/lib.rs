use tauri::Manager;

// 1. Define the command
#[tauri::command]
fn greet_frontend(name: &str) -> String {
    format!("Hello, {}! This message is from Rust/Tauri Backend.", name)
}

#[tauri::command]
fn reset_prompt() -> String {
    "You are a helpful AI assistant.".to_string()
}

#[tauri::command]
fn reset_model() -> String {
    "gemini-2.5-flash".to_string()
}

#[tauri::command]
fn clear_cache() {
    println!("Cache cleared (backend mock)");
}

#[tauri::command]
fn open_external_url(url: &str) {
    println!("Opening URL: {}", url);
}

#[tauri::command]
fn trigger_lens_search() {
    println!("Lens search triggered");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      #[cfg(debug_assertions)]
      {
        let _window = app.get_webview_window("main").unwrap();
        // Optional: Open devtools automatically in dev
        // window.open_devtools();
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
        greet_frontend,
        reset_prompt,
        reset_model,
        clear_cache,
        open_external_url,
        trigger_lens_search
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
