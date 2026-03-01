// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

#[cfg(target_os = "linux")]
pub mod linux;

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "windows")]
pub mod win;
