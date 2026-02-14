// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Emitter, WindowEvent};



pub fn calculate_dynamic_window(
    app: &AppHandle,
    base_w: f64,
    base_h: f64,
) -> Result<(f64, f64, f64, f64), String> {
    let monitor = app
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .ok_or("No monitor found")?;

    let size = monitor.size();
    let pos = monitor.position();

    let screen_w = size.width as f64;
    let screen_h = size.height as f64;

    let frac_w = base_w / 1366.0;
    let frac_h = base_h / 768.0;

    let win_w = (frac_w * screen_w).floor();
    let win_h = (frac_h * screen_h).floor();

    let x = pos.x as f64 + (screen_w - win_w) / 2.0;
    let y = pos.y as f64 + (screen_h - win_h) / 2.0;

    Ok((x, y, win_w, win_h))
}

pub fn spawn_app_window(
    app: &AppHandle,
    label: &str,
    url: &str,
    base_w: f64,
    base_h: f64,
    title: &str,
) -> Result<(), String> {
    if app.get_webview_window(label).is_some() {
        return Ok(());
    }

    let (x, y, w, h) =
        calculate_dynamic_window(app, base_w, base_h).unwrap_or((100.0, 100.0, base_w, base_h));

    let visible = false;

    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(title)
        .position(x, y)
        .inner_size(w, h)
        .visible(visible)
        .resizable(true)
        .decorations(false)
        .background_color(tauri::window::Color(10, 10, 10, 255))
        .build()
        .map_err(|e| e.to_string())?;

    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
            if let Some(first_path) = paths.first() {
                let path_str = first_path.to_string_lossy().to_string();
                let state = window_clone.state::<crate::state::AppState>();

                match crate::services::image::process_and_store_image(path_str.clone(), &state) {
                    Ok(stored) => {
                        let mime = mime_guess::from_path(&stored.path).first_or_octet_stream().to_string();
                        let payload = serde_json::json!({
                            "imageId": stored.hash,
                            "path": stored.path,
                            "mimeType": mime
                        });
                        let _ = window_clone.emit("drag-drop-image", payload);
                    }
                    Err(e) => {
                        eprintln!("Failed to process dropped file: {}", e);
                    }
                }
            }
        }
    });

    Ok(())
}
