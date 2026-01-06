/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import { invoke } from "@tauri-apps/api/core";

export const commands = {
  // Image Processing
  processImagePath: (path: string) =>
    invoke<{ path: string; mimeType: string }>("process_image_path", { path }),
  processImageBytes: (bytes: number[]) =>
    invoke<string>("process_image_bytes", { bytes }),
  getInitialImage: () => invoke<string | null>("get_initial_image"),

  // Auth & Keys
  getApiKey: (provider: "gemini" | "imgbb") =>
    invoke<string>("get_api_key", { provider }),
  resetApiKey: () => invoke("reset_api_key"),
  startGoogleAuth: () => invoke("start_google_auth"),
  logout: () => invoke("logout"),
  getUserData: () => invoke<any>("get_user_data"),

  // Window Mgmt
  openImgbbWindow: () => invoke("open_imgbb_window"),
  closeImgbbWindow: () => invoke("close_imgbb_window"),
  resizeWindow: (width: number, height: number, show: boolean = true) =>
    invoke("resize_window", { width, height, show }),

  // Utils
  openExternalUrl: (url: string) => invoke("open_external_url", { url }),
  clearCache: () => invoke("clear_cache"),

  // Clipboard Watcher
  startClipboardWatcher: () => invoke("start_clipboard_watcher"),
  stopClipboardWatcher: () => invoke("stop_clipboard_watcher"),
};
