// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

//! Linux backend: dual-path implementation.
//!
//! - **Wayland**: XDG Desktop Portal `GlobalShortcuts` via `zbus`
//! - **X11**: `XGrabKey` via `x11rb` (fallback)
//!
//! Session type is detected via `XDG_SESSION_TYPE` env var.

use crate::ShortcutConfig;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

pub(crate) struct LinuxHandle {
    shutdown: Arc<AtomicBool>,
    _thread: std::thread::JoinHandle<()>,
}

impl LinuxHandle {
    pub fn register<F>(config: ShortcutConfig, callback: F) -> Result<Self, String>
    where
        F: Fn() + Send + Sync + 'static,
    {
        let session_type = std::env::var("XDG_SESSION_TYPE")
            .unwrap_or_default()
            .to_lowercase();

        let is_wayland = session_type == "wayland";

        let shutdown = Arc::new(AtomicBool::new(false));
        let shutdown_clone = shutdown.clone();
        let callback = Arc::new(callback);

        let thread = if is_wayland {
            eprintln!("[sys-global-shortcut] Wayland session detected, trying XDG Portal...");
            let cb = callback.clone();
            std::thread::Builder::new()
                .name("global-shortcut-linux".into())
                .spawn(move || {
                    // Try portal first
                    let rt = tokio::runtime::Builder::new_current_thread()
                        .enable_all()
                        .build()
                        .expect("Failed to create tokio runtime");

                    let portal_failed = rt.block_on(async {
                        match wayland::run_portal(config.linux_trigger.clone(), config.linux_description.clone(), cb.clone(), shutdown_clone.clone()).await {
                            Ok(()) => {
                                eprintln!("[sys-global-shortcut] Portal listener exited");
                                false
                            }
                            Err(e) => {
                                eprintln!("[sys-global-shortcut] Portal unavailable: {}", e);
                                true
                            }
                        }
                    });

                    // Fallback to X11 via XWayland (app uses GDK_BACKEND=x11)
                    if portal_failed && !shutdown_clone.load(Ordering::SeqCst) {
                        eprintln!("[sys-global-shortcut] Falling back to XGrabKey (XWayland)...");
                        match x11::run_xgrab(config, cb, shutdown_clone) {
                            Ok(()) => eprintln!("[sys-global-shortcut] X11 listener exited"),
                            Err(e) => eprintln!("[sys-global-shortcut] X11 fallback also failed: {}", e),
                        }
                    }
                })
                .map_err(|e| format!("Thread spawn failed: {}", e))?
        } else {
            eprintln!("[sys-global-shortcut] X11 session detected, using XGrabKey");
            let cb = callback.clone();
            std::thread::Builder::new()
                .name("global-shortcut-x11".into())
                .spawn(move || {
                    match x11::run_xgrab(config, cb, shutdown_clone) {
                        Ok(()) => eprintln!("[sys-global-shortcut] X11 listener exited"),
                        Err(e) => eprintln!("[sys-global-shortcut] X11 grab failed: {}", e),
                    }
                })
                .map_err(|e| format!("Thread spawn failed: {}", e))?
        };

        Ok(Self {
            shutdown,
            _thread: thread,
        })
    }

    pub fn unregister(self) {
        self.shutdown.store(true, Ordering::SeqCst);
    }
}

// ──────────────────────────────────────────────────────────────
//  X11 backend: XGrabKey
// ──────────────────────────────────────────────────────────────
mod x11 {
    use crate::ShortcutConfig;
    use std::sync::{atomic::{AtomicBool, Ordering}, Arc};
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{self, ConnectionExt, GrabMode, ModMask};
    use x11rb::protocol::Event;

    /// Parse the linux_trigger string to extract X11 modifier mask.
    /// Expects format like "SUPER+SHIFT+a"
    fn parse_modifiers(trigger: &str) -> u16 {
        let mut mask: u16 = 0;
        let upper = trigger.to_uppercase();
        if upper.contains("SUPER") || upper.contains("MOD4") {
            mask |= u16::from(ModMask::M4); // Mod4 = Super
        }
        if upper.contains("SHIFT") {
            mask |= u16::from(ModMask::SHIFT);
        }
        if upper.contains("CTRL") || upper.contains("CONTROL") {
            mask |= u16::from(ModMask::CONTROL);
        }
        if upper.contains("ALT") || upper.contains("MOD1") {
            mask |= u16::from(ModMask::M1);
        }
        mask
    }

    /// Extract the key character from trigger string (last segment after '+').
    fn parse_key_char(trigger: &str) -> Option<char> {
        trigger
            .split('+')
            .last()
            .and_then(|s| s.trim().chars().next())
    }

    /// Find the X11 keycode for a character using the connection's keymap.
    fn keycode_for_char(
        conn: &impl Connection,
        setup: &xproto::Setup,
        ch: char,
    ) -> Option<u8> {
        let min_kc = setup.min_keycode;
        let max_kc = setup.max_keycode;

        // Get keyboard mapping
        let mapping = conn
            .get_keyboard_mapping(min_kc, max_kc - min_kc + 1)
            .ok()?
            .reply()
            .ok()?;

        let keysyms_per_keycode = mapping.keysyms_per_keycode as usize;
        let target_keysym = char_to_keysym(ch);

        for kc in min_kc..=max_kc {
            let offset = (kc - min_kc) as usize * keysyms_per_keycode;
            for i in 0..keysyms_per_keycode {
                if offset + i < mapping.keysyms.len() {
                    if mapping.keysyms[offset + i] == target_keysym {
                        return Some(kc);
                    }
                }
            }
        }
        None
    }

    /// Map ASCII char to X11 keysym.
    fn char_to_keysym(ch: char) -> u32 {
        match ch {
            'a'..='z' => ch as u32,         // XK_a..XK_z (0x61..0x7a)
            'A'..='Z' => ch as u32,         // XK_A..XK_Z
            '0'..='9' => ch as u32,         // XK_0..XK_9
            _ => ch as u32,
        }
    }

    pub(super) fn run_xgrab(
        config: ShortcutConfig,
        callback: Arc<dyn Fn() + Send + Sync>,
        shutdown: Arc<AtomicBool>,
    ) -> Result<(), String> {
        let (conn, screen_num) = x11rb::connect(None)
            .map_err(|e| format!("X11 connection failed: {}", e))?;

        let setup = conn.setup();
        let screen = &setup.roots[screen_num];
        let root = screen.root;

        // Parse the trigger
        let mod_mask = parse_modifiers(&config.linux_trigger);
        let key_char = parse_key_char(&config.linux_trigger)
            .ok_or("No key character found in linux_trigger")?;

        let keycode = keycode_for_char(&conn, setup, key_char)
            .ok_or(format!("No keycode found for '{}'", key_char))?;

        eprintln!(
            "[sys-global-shortcut] X11 grabbing: keycode={}, modifiers=0x{:04x}",
            keycode, mod_mask
        );

        // Grab the key on the root window.
        // We grab with multiple modifier combos to handle NumLock/CapsLock.
        let num_lock: u16 = u16::from(ModMask::M2); // Mod2 = NumLock typically
        let caps_lock: u16 = u16::from(ModMask::LOCK);
        let combos = [
            mod_mask,
            mod_mask | num_lock,
            mod_mask | caps_lock,
            mod_mask | num_lock | caps_lock,
        ];

        for combo in &combos {
            conn.grab_key(
                false,              // owner_events
                root,               // grab_window
                ModMask::from(*combo),
                keycode,
                GrabMode::ASYNC,    // pointer_mode
                GrabMode::ASYNC,    // keyboard_mode
            )
            .map_err(|e| format!("XGrabKey failed: {}", e))?;
        }

        conn.flush().map_err(|e| format!("X11 flush failed: {}", e))?;

        eprintln!("[sys-global-shortcut] X11 grab active, listening for key events...");

        // Event loop
        loop {
            if shutdown.load(Ordering::SeqCst) {
                break;
            }

            // Poll with a timeout so we can check shutdown
            match conn.poll_for_event() {
                Ok(Some(event)) => {
                    if let Event::KeyPress(key_event) = event {
                        // Strip NumLock/CapsLock from the state for comparison
                        let raw_state: u16 = key_event.state.into();
                        let clean_state = raw_state & !(num_lock | caps_lock);
                        if key_event.detail == keycode && clean_state == mod_mask {
                            eprintln!("[sys-global-shortcut] Shortcut activated (X11)");
                            callback();
                        }
                    }
                }
                Ok(None) => {
                    // No event, sleep briefly to avoid busy-waiting
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                Err(e) => {
                    eprintln!("[sys-global-shortcut] X11 event error: {}", e);
                    break;
                }
            }
        }

        // Ungrab
        for combo in &combos {
            let _ = conn.ungrab_key(keycode, root, ModMask::from(*combo));
        }
        let _ = conn.flush();

        Ok(())
    }
}

// ──────────────────────────────────────────────────────────────
//  Wayland backend: XDG GlobalShortcuts Portal
// ──────────────────────────────────────────────────────────────
mod wayland {
    use crate::ShortcutConfig;
    use std::collections::HashMap;
    use std::sync::{atomic::{AtomicBool, Ordering}, Arc};
    use zbus::zvariant::{ObjectPath, OwnedValue, Value};

    const PORTAL_DEST: &str = "org.freedesktop.portal.Desktop";
    const PORTAL_PATH: &str = "/org/freedesktop/portal/desktop";
    const PORTAL_IFACE: &str = "org.freedesktop.portal.GlobalShortcuts";
    const REQUEST_IFACE: &str = "org.freedesktop.portal.Request";

    async fn wait_for_response(
        connection: &zbus::Connection,
        request_path: &str,
    ) -> Result<(u32, HashMap<String, OwnedValue>), String> {
        use futures_lite::StreamExt;

        let rule = format!(
            "type='signal',interface='{}',path='{}',member='Response'",
            REQUEST_IFACE, request_path
        );

        connection
            .call_method(
                Some("org.freedesktop.DBus"),
                "/org/freedesktop/DBus",
                Some("org.freedesktop.DBus"),
                "AddMatch",
                &(&rule,),
            )
            .await
            .map_err(|e| format!("AddMatch failed: {}", e))?;

        let mut stream = zbus::MessageStream::from(connection.clone());

        while let Some(item) = stream.next().await {
            let msg: zbus::Message = match item {
                Ok(m) => m,
                Err(_) => continue,
            };

            let header = msg.header();
            let iface_match = header
                .interface()
                .map(|i| i.as_str() == REQUEST_IFACE)
                .unwrap_or(false);
            let member_match = header
                .member()
                .map(|m| m.as_str() == "Response")
                .unwrap_or(false);
            let path_match = header
                .path()
                .map(|p| p.as_str() == request_path)
                .unwrap_or(false);

            if !iface_match || !member_match || !path_match {
                continue;
            }

            let body = msg.body();
            let (response_code, results): (u32, HashMap<String, OwnedValue>) = body
                .deserialize()
                .map_err(|e| format!("Failed to parse Response: {}", e))?;

            return Ok((response_code, results));
        }

        Err("Message stream ended before Response".into())
    }

    fn request_path(sender: &str, token: &str) -> String {
        let sender_clean = sender.trim_start_matches(':').replace('.', "_");
        format!(
            "/org/freedesktop/portal/desktop/request/{}/{}",
            sender_clean, token
        )
    }

    fn gen_token() -> String {
        format!("snapllm_{}", std::process::id())
    }

    pub(super) async fn run_portal(
        linux_trigger: String,
        linux_description: String,
        callback: Arc<dyn Fn() + Send + Sync>,
        shutdown: Arc<AtomicBool>,
    ) -> Result<(), String> {
        use futures_lite::StreamExt;

        let connection = zbus::Connection::session()
            .await
            .map_err(|e| format!("DBus session connection failed: {}", e))?;

        let sender = connection
            .unique_name()
            .ok_or("No unique bus name")?
            .to_string();

        // ── Step 1: CreateSession ──
        let session_token = gen_token();
        let handle_token = format!("{}_cs", &session_token);
        let expected_req_path = request_path(&sender, &handle_token);

        let mut create_opts: HashMap<&str, Value<'_>> = HashMap::new();
        create_opts.insert("handle_token", Value::from(handle_token.as_str()));
        create_opts.insert(
            "session_handle_token",
            Value::from(session_token.as_str()),
        );

        let _reply = connection
            .call_method(
                Some(PORTAL_DEST),
                PORTAL_PATH,
                Some(PORTAL_IFACE),
                "CreateSession",
                &(create_opts,),
            )
            .await
            .map_err(|e| format!("CreateSession call failed: {}", e))?;

        let (code, results) =
            wait_for_response(&connection, &expected_req_path).await?;
        if code != 0 {
            return Err(format!("CreateSession denied (code {})", code));
        }

        let session_handle = results
            .get("session_handle")
            .and_then(|v| <&str>::try_from(v).ok().map(|s| s.to_string()))
            .ok_or("No session_handle in CreateSession response")?;

        eprintln!("[sys-global-shortcut] Portal session: {}", session_handle);

        // ── Step 2: BindShortcuts ──
        let bind_handle_token = format!("{}_bs", &gen_token());
        let expected_bind_path = request_path(&sender, &bind_handle_token);

        let mut shortcut_props: HashMap<&str, Value<'_>> = HashMap::new();
        shortcut_props.insert(
            "description",
            Value::from(linux_description.as_str()),
        );
        shortcut_props.insert(
            "preferred_trigger",
            Value::from(linux_trigger.as_str()),
        );

        let shortcuts: Vec<(&str, HashMap<&str, Value<'_>>)> =
            vec![("toggle-ui", shortcut_props)];

        let mut bind_opts: HashMap<&str, Value<'_>> = HashMap::new();
        bind_opts.insert(
            "handle_token",
            Value::from(bind_handle_token.as_str()),
        );

        let session_path = ObjectPath::try_from(session_handle.as_str())
            .map_err(|e| format!("Invalid session path: {}", e))?;

        let _reply = connection
            .call_method(
                Some(PORTAL_DEST),
                PORTAL_PATH,
                Some(PORTAL_IFACE),
                "BindShortcuts",
                &(session_path, &shortcuts, "", bind_opts),
            )
            .await
            .map_err(|e| format!("BindShortcuts call failed: {}", e))?;

        let (code, _) =
            wait_for_response(&connection, &expected_bind_path).await?;
        if code != 0 {
            return Err(format!("BindShortcuts denied (code {})", code));
        }

        eprintln!("[sys-global-shortcut] Shortcuts bound, listening...");

        // ── Step 3: Listen for Activated signal ──
        let activated_rule = format!(
            "type='signal',interface='{}',member='Activated'",
            PORTAL_IFACE
        );
        connection
            .call_method(
                Some("org.freedesktop.DBus"),
                "/org/freedesktop/DBus",
                Some("org.freedesktop.DBus"),
                "AddMatch",
                &(&activated_rule,),
            )
            .await
            .map_err(|e| format!("AddMatch for Activated failed: {}", e))?;

        let mut stream = zbus::MessageStream::from(connection.clone());

        while let Some(item) = stream.next().await {
            if shutdown.load(Ordering::SeqCst) {
                break;
            }

            let msg: zbus::Message = match item {
                Ok(m) => m,
                Err(_) => continue,
            };

            let header = msg.header();
            let iface_match = header
                .interface()
                .map(|i| i.as_str() == PORTAL_IFACE)
                .unwrap_or(false);
            let member_match = header
                .member()
                .map(|m| m.as_str() == "Activated")
                .unwrap_or(false);

            if !iface_match || !member_match {
                continue;
            }

            let body = msg.body();
            if let Ok((_session, shortcut_id, _timestamp, _opts)) =
                body.deserialize::<(
                    ObjectPath<'_>,
                    &str,
                    u64,
                    HashMap<String, OwnedValue>,
                )>()
            {
                eprintln!("[sys-global-shortcut] Portal shortcut activated: {}", shortcut_id);
                callback();
            }
        }

        Ok(())
    }
}
