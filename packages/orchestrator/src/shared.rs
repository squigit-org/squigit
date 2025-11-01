/**
 * Copyright (C) 2025  a7mddra-spatialshot
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

use anyhow::Result;
use home;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub tmp_dir: PathBuf,
    pub core_path: PathBuf,
}

pub fn setup_paths() -> Result<AppPaths> {
    let _home_dir = home::home_dir().ok_or(anyhow::anyhow!("No home dir"))?;

    #[cfg(target_os = "linux")]
    let (cache_home, data_home) = {
        let cache = std::env::var("XDG_CACHE_HOME")
            .unwrap_or_else(|_| _home_dir.join(".cache").to_string_lossy().to_string());
        let data = std::env::var("XDG_DATA_HOME")
            .unwrap_or_else(|_| _home_dir.join(".local/share").to_string_lossy().to_string());
        (cache, data)
    };

    #[cfg(target_os = "macos")]
    let (caches, app_support) = {
        let support = _home_dir.join("Library/Application Support");
        let cache = _home_dir.join("Library/Caches");
        (cache, support)
    };

    #[cfg(target_os = "windows")]
    let local_app_data = std::env::var("LOCALAPPDATA").map_err(|e| anyhow::anyhow!(e))?;

    let spatial_dir = {
        #[cfg(target_os = "linux")]
        {
            PathBuf::from(data_home).join("spatialshot")
        }
        #[cfg(target_os = "macos")]
        {
            app_support.join("spatialshot")
        }
        #[cfg(target_os = "windows")]
        {
            PathBuf::from(local_app_data.clone()).join("spatialshot")
        }
    };

    std::fs::create_dir_all(&spatial_dir)?;

    let core_path = spatial_dir.join({
        #[cfg(unix)]
        {
            "core.sh"
        }
        #[cfg(target_os = "windows")]
        {
            "core.ps1"
        }
    });

    let tmp_dir = {
        #[cfg(target_os = "linux")]
        {
            PathBuf::from(cache_home).join("spatialshot/tmp")
        }
        #[cfg(target_os = "macos")]
        {
            caches.join("spatialshot/tmp")
        }
        #[cfg(target_os = "windows")]
        {
            PathBuf::from(local_app_data).join("spatialshot/tmp")
        }
    };

    std::fs::create_dir_all(&tmp_dir)?;

    Ok(AppPaths { tmp_dir, core_path })
}
