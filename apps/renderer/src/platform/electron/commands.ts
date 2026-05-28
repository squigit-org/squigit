/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { platform } from "./index";

export const commands = {
  // Window
  closeWindow: () => platform.invoke("close_window"),
  minimizeWindow: () => platform.invoke("minimize_window"),
  maximizeWindow: () => platform.invoke("maximize_window"),
  setAlwaysOnTop: (state: boolean) => platform.invoke("set_always_on_top", { state }),
  
  // OS
  getLinuxPackageManager: () => platform.invoke<string>("get_linux_package_manager"),
  
  // Storage
  revealInFileManager: (path: string) => platform.invoke("reveal_in_file_manager", { path }),
  readAttachmentText: (path: string) => platform.invoke<string>("read_attachment_text", { path }),
  validateTextFile: (path: string) => platform.invoke<boolean>("validate_text_file", { path }),
  
  // Sidecars
  runSidecarVersion: (command: string) => platform.invoke<string>("run_sidecar_version", { command }),
  // Image Storage & Processing
  processImagePath: (path: string) =>
    platform.invoke<string>("process_image_path", { path }),
  readImageFile: (path: string) =>
    platform.invoke<number[]>("read_image_file", { path }),
  storeImageFromPath: (path: string) =>
    platform.invoke<{ hash: string; path: string }>("store_image_from_path", {
      path,
    }),
  storeImageBytes: (bytes: number[], originalName?: string) =>
    platform.invoke<{ hash: string; path: string }>("store_image_bytes", {
      bytes,
      originalName,
    }),
  resolveAttachmentPath: (path: string) =>
    platform.invoke<string>("resolve_attachment_path", { path }),

  // Clipboard
  copyImageToClipboard: (base64Data: string) =>
    platform.invoke("copy_image_to_clipboard", { base64Data }),
  copyImageFromPathToClipboard: (path: string) =>
    platform.invoke("copy_image_from_path_to_clipboard", { path }),
  readClipboardImage: () => platform.invoke<string | null>("read_clipboard_image"),
  readClipboardText: () => platform.invoke<string | null>("read_clipboard_text"),

  // OCR
  ocrImage: (base64Image: string, language: string) =>
    platform.invoke<{
      text: string;
      rawOutput: string;
      processingTimeMs: number;
    }>("ocr_image", { base64Image, language }),

  // Settings
  setBackgroundColor: (color: string) =>
    platform.invoke("set_background_color", { color }),
  getSystemTheme: () => platform.invoke<"light" | "dark">("get_system_theme"),
  openExternalUrl: (url: string) =>
    platform.invoke("open_external_url", { url }),

  // App Utilities
  getAppConstants: () =>
    platform.invoke<{ appVersion: string }>("get_app_constants"),

  // Accounts
  listProfiles: () => platform.invoke<any[]>("list_profiles"),
  getActiveProfile: () => platform.invoke<any>("get_active_profile"),
  setActiveProfile: (profileId: string | null) =>
    platform.invoke("set_active_profile", { profileId }),
};
