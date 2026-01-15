// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

use anyhow::{Context, Result};
use std::env;
use std::path::PathBuf;

pub struct QtPaths {
    pub bin: PathBuf,
    pub env_vars: Vec<(String, String)>,
}

impl QtPaths {
    pub fn resolve() -> Result<Self> {
        let exe_path = env::current_exe()?;
        let exe_dir = exe_path.parent().context("No parent dir for executable")?;
        let qt_runtime = exe_dir.join("qt-runtime");

        #[cfg(target_os = "linux")]
        {
            let usr = qt_runtime.join("usr");
            let bin = usr.join("bin").join("capture-bin");
            let libs = usr.join("lib");
            let plugins = usr.join("plugins");
            let qml = usr.join("qml");

            if !bin.exists() {
                anyhow::bail!("Qt binary not found at {}", bin.display());
            }

            let mut env_vars = Vec::new();
            let mut ld_path = libs.to_string_lossy().to_string();
            if let Ok(existing) = env::var("LD_LIBRARY_PATH") {
                ld_path = format!("{}:{}", ld_path, existing);
            }
            env_vars.push(("LD_LIBRARY_PATH".to_string(), ld_path));
            env_vars.push((
                "QT_PLUGIN_PATH".to_string(),
                plugins.to_string_lossy().to_string(),
            ));
            env_vars.push((
                "QML2_IMPORT_PATH".to_string(),
                qml.to_string_lossy().to_string(),
            ));
            env_vars.push((
                "QT_QPA_PLATFORM_PLUGIN_PATH".to_string(),
                plugins.join("platforms").to_string_lossy().to_string(),
            ));

            Ok(QtPaths { bin, env_vars })
        }

        #[cfg(target_os = "macos")]
        {
            let bin = qt_runtime.join("capture.app/Contents/MacOS/capture");
            if !bin.exists() {
                anyhow::bail!("Qt binary not found at {}", bin.display());
            }
            Ok(QtPaths {
                bin,
                env_vars: vec![],
            })
        }

        #[cfg(target_os = "windows")]
        {
            let bin = qt_runtime.join("capture.exe");
            if !bin.exists() {
                anyhow::bail!("Qt binary not found at {}", bin.display());
            }
            Ok(QtPaths {
                bin,
                env_vars: vec![],
            })
        }

        #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
        {
            anyhow::bail!("Unsupported platform")
        }
    }
}
