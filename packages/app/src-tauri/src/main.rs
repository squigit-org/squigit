#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/*
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

fn main() {
  #[cfg(target_os = "linux")]
  {
    std::env::set_var("GTK_IM_MODULE", "xim");
    std::env::set_var("GDK_BACKEND", "x11");
  }

  app_lib::run();
}
