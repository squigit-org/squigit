// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::services::window;
use tauri::{AppHandle, Emitter, Manager, Size, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri::window::Color;

#[tauri::command]
pub async fn open_imgbb_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("imgbb-setup") {
        let _ = window.set_focus();
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(
        &app,
        "imgbb-setup",
        WebviewUrl::App("index.html?mode=imgbb".into()),
    )
    .title("ImgBB Setup")
    .inner_size(480.0, 430.0)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .always_on_top(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
    let app_handle = app.clone();
    win.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
            println!("ImgBB window closed/destroyed event detected");
            let _ = app_handle.emit("imgbb-popup-closed", ());
        }
        _ => {}
    });
    Ok(())
}

#[tauri::command]
pub fn close_imgbb_window(app: AppHandle) {
    if let Some(win) = app.get_webview_window("imgbb-setup") {
        let _ = win.close();
    }
}

#[tauri::command]
pub async fn resize_window(
    app: AppHandle,
    width: f64,
    height: f64,
    show: Option<bool>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;

    let (x, y, target_w, target_h) = window::calculate_dynamic_window(&app, width, height)?;

    window
        .set_size(Size::Physical(tauri::PhysicalSize {
            width: target_w as u32,
            height: target_h as u32,
        }))
        .map_err(|e| e.to_string())?;

    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: x as i32,
            y: y as i32,
        }))
        .map_err(|e| e.to_string())?;

    if show.unwrap_or(false) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    println!("Opening URL: {}", url);
    tauri::async_runtime::spawn_blocking(move || {
        crate::utils::open_url(&url)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn set_background_color(app: AppHandle, color: String) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Main window not found")?;
    
    let color = color.trim_start_matches('#');
    let (r, g, b) = if color.len() == 6 {
        let r = u8::from_str_radix(&color[0..2], 16).map_err(|e| e.to_string())?;
        let g = u8::from_str_radix(&color[2..4], 16).map_err(|e| e.to_string())?;
        let b = u8::from_str_radix(&color[4..6], 16).map_err(|e| e.to_string())?;
        (r, g, b)
    } else {
        return Err("Invalid color format. Use #RRGGBB".to_string());
    };

    let _ = window.set_background_color(Some(Color(r, g, b, 255)));
    Ok(())
}

#[tauri::command]
pub fn minimize_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Main window not found")?;
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn maximize_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Main window not found")?;
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn close_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("Main window not found")?;
    window.close().map_err(|e| e.to_string())
}
