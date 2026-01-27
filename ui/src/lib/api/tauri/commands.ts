/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import { invoke } from "@tauri-apps/api/core";

export const commands = {
  // Image Processing
  processImagePath: (path: string) =>
    invoke<{ hash: string; path: string }>("process_image_path", { path }),
  processImageBytes: (bytes: number[]) =>
    invoke<{ hash: string; path: string }>("process_image_bytes", { bytes }),
  getInitialImage: () =>
    invoke<{ hash: string; path: string } | null>("get_initial_image"),

  // Auth & Keys
  getApiKey: (provider: "gemini" | "imgbb") =>
    invoke<string>("get_api_key", { provider }),
  setApiKey: (provider: "gemini" | "imgbb", key: string) =>
    invoke("set_api_key", { provider, key }),
  resetApiKey: () => invoke("reset_api_key"),
  startGoogleAuth: () => invoke("start_google_auth"),
  logout: () => invoke("logout"),
  getUserData: () => invoke<any>("get_user_data"),

  // Window Mgmt
  openImgbbWindow: () => invoke("open_imgbb_window"),
  closeImgbbWindow: () => invoke("close_imgbb_window"),
  resizeWindow: (width: number, height: number, show: boolean = true) =>
    invoke("resize_window", { width, height, show }),
  setBackgroundColor: (color: string) =>
    invoke("set_background_color", { color }),

  // Utils
  openExternalUrl: (url: string) => invoke("open_external_url", { url }),
  startClipboardWatcher: () => invoke("start_clipboard_watcher"),
  stopClipboardWatcher: () => invoke("stop_clipboard_watcher"),
};
