// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use crate::ShortcutConfig;
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use zbus::interface;

pub(crate) struct LinuxHandle {
    shutdown: Arc<AtomicBool>,

    _thread: std::thread::JoinHandle<()>,
}

pub fn trigger_linux_ipc() -> bool {
    true
}

pub fn install_linux_shortcut(_bin_path: &str, trigger: &str, name: &str) -> Result<(), String> {
    let de = std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_lowercase();

    let trigger_gnome = format!("<Super><Shift>{}", trigger.split('+').last().unwrap_or("a"));
    let trigger_kde = format!(
        "Meta+Shift+{}",
        trigger.split('+').last().unwrap_or("A").to_uppercase()
    );

    let command = "dbus-send --session --type=method_call --dest=com.snapllm.app /com/snapllm/app com.snapllm.app.Toggle";

    if de.contains("gnome")
        || de.contains("ubuntu")
        || de.contains("unity")
        || de.contains("budgie")
    {
        let binding_path =
            "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/snapllm-binding/";
        let schema = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding";

        let get_bindings = Command::new("gsettings")
            .arg("get")
            .arg("org.gnome.settings-daemon.plugins.media-keys")
            .arg("custom-keybindings")
            .output();

        if let Ok(output) = get_bindings {
            let mut list = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if list == "@as []" {
                list = "[]".to_string();
            }
            if !list.contains(binding_path) {
                let new_list = if list == "[]" {
                    format!("['{}']", binding_path)
                } else {
                    format!("{}, '{}']", list.trim_end_matches(']'), binding_path)
                };
                let _ = Command::new("gsettings")
                    .args(&[
                        "set",
                        "org.gnome.settings-daemon.plugins.media-keys",
                        "custom-keybindings",
                        &new_list,
                    ])
                    .output();
            }

            let _ = Command::new("gsettings")
                .args(&["set", &format!("{}:{}", schema, binding_path), "name", name])
                .output();
            let _ = Command::new("gsettings")
                .args(&[
                    "set",
                    &format!("{}:{}", schema, binding_path),
                    "command",
                    command,
                ])
                .output();
            let _ = Command::new("gsettings")
                .args(&[
                    "set",
                    &format!("{}:{}", schema, binding_path),
                    "binding",
                    &trigger_gnome,
                ])
                .output();
            return Ok(());
        }
        return Err("Failed to setup GNOME bindings via gsettings".into());
    } else if de.contains("kde") || de.contains("plasma") {
        let uuid_str = format!("12345678-1234-5678-1234-{:012x}", std::process::id());
        let import_file = format!("/tmp/snapllm-binding.khotkeys");
        let content = format!(
            "[Data]
DataCount=1
[Data_1]
Comment={name}
Enabled=true
Name={name}
Type=SIMPLE_ACTION_DATA
[Data_1Actions]
ActionsCount=1
[Data_1Actions0]
CommandURL={command}
Type=COMMAND_URL
[Data_1Triggers]
TriggersCount=1
[Data_1Triggers0]
Key={trigger_kde}
Type=SHORTCUT
Uuid={{{uuid_str}}}"
        );
        std::fs::write(&import_file, content).map_err(|e| e.to_string())?;

        let _ = Command::new("qdbus")
            .args(&[
                "org.kde.kded5",
                "/modules/khotkeys",
                "org.kde.khotkeys.import_shortcuts_list",
                &import_file,
            ])
            .output();
        let _ = Command::new("qdbus")
            .args(&[
                "org.kde.kglobalaccel",
                "/kglobalaccel",
                "org.kde.kglobalaccel.Component.importLegacyShortcuts",
                &import_file,
            ])
            .output();
        return Ok(());
    } else if de.contains("xfce") {
        let _ = Command::new("xfconf-query")
            .args(&[
                "--channel",
                "xfce4-keyboard-shortcuts",
                "--property",
                &format!("/commands/custom/{}", trigger_gnome),
                "--create",
                "--type",
                "string",
                "--set",
                command,
            ])
            .output();
        return Ok(());
    }

    Err(format!(
        "Unsupported Desktop Environment: {}, please configure shortcut manually",
        de
    )
    .into())
}

struct SnapllmDbus {
    callback: Arc<dyn Fn() + Send + Sync + 'static>,
}

#[interface(name = "com.snapllm.app")]
impl SnapllmDbus {
    async fn toggle(&self) {
        (self.callback)();
    }
}

impl LinuxHandle {
    pub fn register<F>(_config: ShortcutConfig, callback: F) -> Result<Self, String>
    where
        F: Fn() + Send + Sync + 'static,
    {
        let shutdown = Arc::new(AtomicBool::new(false));
        let shutdown_clone = shutdown.clone();
        let cb: Arc<dyn Fn() + Send + Sync + 'static> = Arc::new(callback);

        let thread = std::thread::Builder::new()
            .name("dbus-listener".into())
            .spawn(move || {
                let rt = match tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                {
                    Ok(rt) => rt,
                    Err(_) => return,
                };

                rt.block_on(async {
                    let dbus_service = SnapllmDbus { callback: cb };

                    let _conn = match zbus::connection::Builder::session() {
                        Ok(builder) => match builder
                            .name("com.snapllm.app")
                            .expect("Invalid D-Bus name")
                            .serve_at("/com/snapllm/app", dbus_service)
                            .expect("Failed to serve dbus interface")
                            .build()
                            .await
                        {
                            Ok(c) => c,
                            Err(_) => return,
                        },
                        Err(_) => return,
                    };

                    loop {
                        if shutdown_clone.load(Ordering::SeqCst) {
                            break;
                        }

                        let _ = tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;
                    }
                });
            })
            .map_err(|e| e.to_string())?;

        Ok(Self {
            shutdown,
            _thread: thread,
        })
    }

    pub fn unregister(self) {
        self.shutdown.store(true, Ordering::SeqCst);
    }
}
