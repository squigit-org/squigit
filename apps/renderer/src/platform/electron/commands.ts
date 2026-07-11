/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { platform } from "./index";
import type { Profile } from "../tauri/tauri.types";

type NativeProfile = Profile & {
  avatarBase64?: string | null;
  avatarUrl?: string | null;
};

const normalizeProfile = (profile: NativeProfile | null): Profile | null => {
  if (!profile) return null;

  return {
    ...profile,
    avatar_base64: profile.avatar_base64 ?? profile.avatarBase64 ?? null,
    avatar_url: profile.avatar_url ?? profile.avatarUrl ?? null,
  };
};

const normalizeProfiles = (profiles: NativeProfile[]) =>
  profiles.map((profile) => normalizeProfile(profile) as Profile);

export const commands = {
  // Window
  closeWindow: () => platform.invoke("close_window"),
  minimizeWindow: () => platform.invoke("minimize_window"),
  maximizeWindow: () => platform.invoke("maximize_window"),
  setAlwaysOnTop: (state: boolean) => platform.invoke("set_always_on_top", { state }),
  
  // OS
  getLinuxPackageManager: () => platform.invoke<string>("get_linux_package_manager"),
  getMachineInfo: () => platform.invoke<string>("get_machine_info"),
  
  // Storage
  revealInFileManager: (path: string) => platform.invoke("reveal_in_file_manager", { path }),
  readAttachmentText: (path: string) => platform.invoke<string>("read_attachment_text", { path }),
  validateTextFile: (path: string) => platform.invoke<boolean>("validate_text_file", { path }),
  
  // Sidecars
  runSidecarVersion: (command: string) => platform.invoke<string>("run_sidecar_version", { command }),
  
  // App Capture
  getInitialImage: () => platform.invoke<{ hash: string; path: string } | null>("get_initial_image"),

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
  listProfiles: async () =>
    normalizeProfiles(await platform.invoke<NativeProfile[]>("list_profiles")),
  getActiveProfile: async () =>
    normalizeProfile(await platform.invoke<NativeProfile | null>("get_active_profile")),
  getProfile: async (profileId: string) =>
    normalizeProfile(
      await platform.invoke<NativeProfile | null>("get_profile", { profileId }),
    ),
  setActiveProfile: (profileId: string | null) => platform.invoke("set_active_profile", { profileId }),
  hydrateAvatar: (url: string, profileId?: string) => platform.invoke<string>("hydrate_avatar", { url, profileId }),
  setApiKey: (provider: "google ai studio" | "imgbb", key: string, profileId: string) => platform.invoke("encrypt_and_save", { provider, plaintext: key, profileId }),
  startGoogleAuth: () => platform.invoke("start_google_auth"),
  cancelGoogleAuth: () => platform.invoke("cancel_google_auth"),
  logout: () => platform.invoke("logout"),
  getActiveProfileId: () => platform.invoke<string | null>("get_active_profile_id"),
  hasProfiles: () => platform.invoke<boolean>("has_profiles"),
  getProfileCount: () => platform.invoke<number>("get_profile_count"),
  
  // OCR Model Management
  cancelDownloadOcrModel: (modelId: string) => platform.invoke("cancel_download_ocr_model", { modelId }),
  
  // AI Runtime Control
  quickAnswerProviderRequest: (channelId: string) => platform.invoke("quick_answer_request", { channelId }),
  
  // UI audio
  playUiSound: (effect: "dialog-warning" = "dialog-warning") => platform.invoke("play_ui_sound", { effect }),
};
