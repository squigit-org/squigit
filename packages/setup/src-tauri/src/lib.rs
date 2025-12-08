#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      use tauri::Manager;
      if let Some(window) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let screen_size = monitor.size();
            let monitor_pos = monitor.position();
            let width = (screen_size.width as f64 * (730.0 / 1366.0)).round() as u32;
            let height = (screen_size.height as f64 * (580.0 / 768.0)).round() as u32;
            
            let x = monitor_pos.x + ((screen_size.width as i32 - width as i32) / 2);
            let y = monitor_pos.y + ((screen_size.height as i32 - height as i32) / 2);

            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }));
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
            let _ = window.show();
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
