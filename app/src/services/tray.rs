// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use tauri::{AppHandle, Manager};

/// Toggle the main window: show+focus if hidden, hide if visible.
pub fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

// ──────────────────────────────────────────────────────────────
//  macOS / Windows — Tauri native TrayIconBuilder
// ──────────────────────────────────────────────────────────────
#[cfg(not(target_os = "linux"))]
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show_i = MenuItem::with_id(app, "show_ui", "Show UI", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let exit_i = MenuItem::with_id(app, "exit", "Exit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_i, &sep, &exit_i])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("SnapLLM")
        .menu(&menu)
        .menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show_ui" => toggle_window(app),
            "exit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

// ──────────────────────────────────────────────────────────────
//  Linux — Direct StatusNotifierItem via zbus/DBus
//  Bypasses libappindicator so left-click fires Activate()
// ──────────────────────────────────────────────────────────────
#[cfg(target_os = "linux")]
mod sni {
    use tauri::AppHandle;
    use image::GenericImageView;
    use zbus::object_server::SignalEmitter;

    /// Load 32x32 icon at compile time, convert RGBA → ARGB for SNI pixmap.
    fn load_icon_argb() -> (i32, i32, Vec<u8>) {
        let img = image::load_from_memory_with_format(
            include_bytes!("../../icons/32x32.png"),
            image::ImageFormat::Png,
        )
        .expect("embedded tray icon must be valid PNG");

        let (w, h) = img.dimensions();
        let mut data = img.into_rgba8().into_vec();
        // SNI expects ARGB32 in network byte order (big-endian).
        // PNG decodes as RGBA. Swap [R,G,B,A] → [A,R,G,B].
        for pixel in data.chunks_exact_mut(4) {
            pixel.rotate_right(1);
        }
        (w as i32, h as i32, data)
    }

    /// DBus menu interface (com.canonical.dbusmenu)
    /// Provides "Show UI" and "Exit" items.
    pub struct DbusMenu {
        pub app_handle: AppHandle,
    }

    #[zbus::interface(name = "com.canonical.dbusmenu")]
    impl DbusMenu {
        #[zbus(property)]
        fn version(&self) -> u32 {
            3
        }

        #[zbus(property)]
        fn text_direction(&self) -> &str {
            "ltr"
        }

        #[zbus(property)]
        fn status(&self) -> &str {
            "normal"
        }

        fn get_layout(
            &self,
            _parent_id: i32,
            _recursion_depth: i32,
            _property_names: Vec<String>,
        ) -> zbus::fdo::Result<(
            u32,
            (
                i32,
                std::collections::HashMap<String, zbus::zvariant::OwnedValue>,
                Vec<zbus::zvariant::OwnedValue>,
            ),
        )> {
            use zbus::zvariant::{OwnedValue, Value};
            use std::collections::HashMap;

            // Build child items
            let mut show_props: HashMap<String, OwnedValue> = HashMap::new();
            show_props.insert("label".into(), Value::from("Show UI").try_into().unwrap());
            show_props.insert("enabled".into(), Value::from(true).try_into().unwrap());

            let mut sep_props: HashMap<String, OwnedValue> = HashMap::new();
            sep_props.insert("type".into(), Value::from("separator").try_into().unwrap());

            let mut exit_props: HashMap<String, OwnedValue> = HashMap::new();
            exit_props.insert("label".into(), Value::from("Exit").try_into().unwrap());
            exit_props.insert("enabled".into(), Value::from(true).try_into().unwrap());

            let show_item: (i32, HashMap<String, OwnedValue>, Vec<OwnedValue>) =
                (1, show_props, vec![]);
            let sep_item: (i32, HashMap<String, OwnedValue>, Vec<OwnedValue>) =
                (2, sep_props, vec![]);
            let exit_item: (i32, HashMap<String, OwnedValue>, Vec<OwnedValue>) =
                (3, exit_props, vec![]);

            let children: Vec<OwnedValue> = vec![
                Value::from(show_item).try_into().unwrap(),
                Value::from(sep_item).try_into().unwrap(),
                Value::from(exit_item).try_into().unwrap(),
            ];

            let mut root_props: HashMap<String, OwnedValue> = HashMap::new();
            root_props.insert(
                "children-display".into(),
                Value::from("submenu").try_into().unwrap(),
            );

            Ok((1, (0, root_props, children)))
        }

        fn get_group_properties(
            &self,
            _ids: Vec<i32>,
            _property_names: Vec<String>,
        ) -> zbus::fdo::Result<Vec<(i32, std::collections::HashMap<String, zbus::zvariant::OwnedValue>)>>
        {
            Ok(vec![])
        }

        fn event(
            &self,
            id: i32,
            event_id: &str,
            _data: zbus::zvariant::Value<'_>,
            _timestamp: u32,
        ) -> zbus::fdo::Result<()> {
            if event_id == "clicked" {
                match id {
                    1 => super::toggle_window(&self.app_handle), // Show UI
                    3 => self.app_handle.exit(0),                // Exit
                    _ => {}
                }
            }
            Ok(())
        }

        fn about_to_show(&self, _id: i32) -> zbus::fdo::Result<bool> {
            Ok(true)
        }
    }

    /// StatusNotifierItem DBus interface
    pub struct StatusNotifierItem {
        pub app_handle: AppHandle,
        icon_pixmap: Vec<(i32, i32, Vec<u8>)>,
    }

    impl StatusNotifierItem {
        pub fn new(app_handle: AppHandle) -> Self {
            let (w, h, data) = load_icon_argb();
            Self {
                app_handle,
                icon_pixmap: vec![(w, h, data)],
            }
        }
    }

    #[zbus::interface(name = "org.kde.StatusNotifierItem")]
    impl StatusNotifierItem {
        // ── Properties ──

        #[zbus(property)]
        fn category(&self) -> &str {
            "ApplicationStatus"
        }

        #[zbus(property)]
        fn id(&self) -> &str {
            "snapllm"
        }

        #[zbus(property)]
        fn title(&self) -> &str {
            "SnapLLM"
        }

        #[zbus(property)]
        fn status(&self) -> &str {
            "Active"
        }

        /// SNI pixmap icon: Vec<(width, height, ARGB_data)>
        #[zbus(property)]
        fn icon_pixmap(&self) -> &Vec<(i32, i32, Vec<u8>)> {
            &self.icon_pixmap
        }

        #[zbus(property)]
        fn icon_name(&self) -> &str {
            ""
        }

        #[zbus(property)]
        fn menu(&self) -> zbus::zvariant::ObjectPath<'_> {
            zbus::zvariant::ObjectPath::try_from("/MenuBar").unwrap()
        }

        #[zbus(property)]
        fn item_is_menu(&self) -> bool {
            false
        }

        #[zbus(property)]
        fn window_id(&self) -> i32 {
            0
        }

        // ── Methods ──

        /// Left-click action (Activate in SNI spec)
        fn activate(&self, _x: i32, _y: i32) -> zbus::fdo::Result<()> {
            super::toggle_window(&self.app_handle);
            Ok(())
        }

        fn secondary_activate(&self, _x: i32, _y: i32) -> zbus::fdo::Result<()> {
            Ok(())
        }

        fn scroll(&self, _delta: i32, _orientation: &str) -> zbus::fdo::Result<()> {
            Ok(())
        }

        // ── Signals ──

        #[zbus(signal)]
        async fn new_icon(signal_emitter: &SignalEmitter<'_>) -> zbus::Result<()>;

        #[zbus(signal)]
        async fn new_title(signal_emitter: &SignalEmitter<'_>) -> zbus::Result<()>;

        #[zbus(signal)]
        async fn new_status(signal_emitter: &SignalEmitter<'_>, status: &str) -> zbus::Result<()>;
    }

    /// Register the SNI item with the StatusNotifierWatcher
    pub async fn register_with_watcher(
        connection: &zbus::Connection,
        service_name: &str,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let _watcher = connection
            .call_method(
                Some("org.kde.StatusNotifierWatcher"),
                "/StatusNotifierWatcher",
                Some("org.kde.StatusNotifierWatcher"),
                "RegisterStatusNotifierItem",
                &(service_name,),
            )
            .await?;
        Ok(())
    }
}

#[cfg(target_os = "linux")]
pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.clone();

    tauri::async_runtime::spawn(async move {
        match setup_sni_tray(handle).await {
            Ok(()) => {} // Runs until connection drops
            Err(e) => eprintln!("SNI tray setup failed: {}", e),
        }
    });

    Ok(())
}

#[cfg(target_os = "linux")]
async fn setup_sni_tray(app: AppHandle) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use zbus::conn::Builder;

    let service_name = format!("org.kde.StatusNotifierItem-{}-1", std::process::id());

    let sni_item = sni::StatusNotifierItem::new(app.clone());
    let dbus_menu = sni::DbusMenu {
        app_handle: app.clone(),
    };

    let connection = Builder::session()?
        .name(service_name.as_str())?
        .serve_at("/StatusNotifierItem", sni_item)?
        .serve_at("/MenuBar", dbus_menu)?
        .build()
        .await?;

    // Register with the StatusNotifierWatcher so panels pick up the icon
    sni::register_with_watcher(&connection, &service_name).await?;

    // Keep alive — drop means the tray disappears
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
    }
}
