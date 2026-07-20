/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Profile } from "./tauri.types";
export * from "./tauri.types";

export const commands = {
  // Image Processing
  hydrateAvatar: (url: string, profileId?: string) =>
    invoke<string>("hydrate_avatar", { url, profileId }),
  processImagePath: (path: string) =>
    invoke<{ hash: string; path: string }>("process_image_path", { path }),
  getInitialImage: () =>
    invoke<{ hash: string; path: string } | null>("get_initial_image"),

  // Auth & Keys (profile-aware)
  getApiKey: (provider: "google ai studio" | "imgbb", profileId: string) =>
    invoke<string>("get_api_key", { provider, profileId }),
  setApiKey: (
    provider: "google ai studio" | "imgbb",
    key: string,
    profileId: string,
  ) =>
    invoke("encrypt_and_save", {
      provider,
      plaintext: key,
      profileId,
    }),
  startGoogleAuth: () => invoke("start_google_auth"),
  cancelGoogleAuth: () => invoke("cancel_google_auth"),
  logout: () => invoke("logout"),

  // Profile Management
  getActiveProfile: () => invoke<Profile | null>("get_active_profile"),
  getProfileSnapshot: async () => {
    const [activeProfileId, activeProfile, profiles] = await Promise.all([
      invoke<string | null>("get_active_profile_id"),
      invoke<Profile | null>("get_active_profile"),
      invoke<Profile[]>("list_profiles"),
    ]);

    return { activeProfileId, activeProfile, profiles };
  },
  getProfile: (profileId: string) => invoke<Profile | null>("get_profile", { profileId }),
  getActiveProfileId: () => invoke<string | null>("get_active_profile_id"),
  listProfiles: () => invoke<Profile[]>("list_profiles"),
  setActiveProfile: (profileId: string) =>
    invoke("set_active_profile", { profileId }),
  deleteProfile: (profileId: string) => invoke("delete_profile", { profileId }),
  hasProfiles: () => invoke<boolean>("has_profiles"),
  getProfileCount: () => invoke<number>("get_profile_count"),

  // Window Mgmt
  setBackgroundColor: (color: string) =>
    invoke("set_background_color", { color }),

  // OCR Model Management
  cancelDownloadOcrModel: (modelId: string) =>
    invoke("cancel_download_ocr_model", { modelId }),
  trashDownloadedOcrModel: (modelId: string) =>
    invoke("trash_downloaded_ocr_model", { modelId }),

  // AI Runtime Control
  quickAnswerProviderRequest: (channelId: string) =>
    invoke("quick_answer_request", { channelId }),

  // UI audio
  playUiSound: (effect: "dialog-warning" = "dialog-warning") =>
    invoke("play_ui_sound", { effect }),

  // Utils
  openExternalUrl: (url: string) => invoke("open_external_url", { url }),
  getAppConstants: () =>
    invoke<import("./tauri.types").AppConstants>("get_app_constants"),

  // Commands moved from direct invoke
  closeWindow: () => invoke("close_window"),
  minimizeWindow: () => invoke("minimize_window"),
  maximizeWindow: () => invoke("maximize_window"),
  setAlwaysOnTop: (state: boolean) => invoke("set_always_on_top", { state }),
  getSystemTheme: () => invoke<"light" | "dark">("get_system_theme"),
  getLinuxPackageManager: () => invoke<string>("get_linux_package_manager"),
  getMachineInfo: () => invoke<string>("get_machine_info"),
  resolveAttachmentPath: (path: string) =>
    invoke<string>("resolve_attachment_path", { path }),
  registerAttachmentSource: (
    threadId: string,
    casPath: string,
    sourcePath: string,
    displayName?: string,
  ) =>
    invoke("register_attachment_source", {
      threadId,
      casPath,
      sourcePath,
      displayName,
    }),
  reviseAttachmentCasPath: (
    threadId: string,
    citationPath: string,
    newCasPath: string,
    displayName?: string,
  ) =>
    invoke("revise_attachment_cas_path", {
      threadId,
      citationPath,
      newCasPath,
      displayName,
    }),
  resolveAttachmentCasPath: (citationPath: string, threadId: string) =>
    invoke<string | null>("resolve_attachment_cas_path", {
      citationPath,
      threadId,
    }),
  resolveAttachmentSourcePath: (casPath: string, threadId?: string) =>
    invoke<string | null>("resolve_attachment_source_path", {
      casPath,
      threadId,
    }),
  listAttachmentSources: (threadId?: string) =>
    invoke<Record<string, string>>("list_attachment_sources", { threadId }),
  readAttachmentText: (path: string) =>
    invoke<string>("read_attachment_text", { path }),
  validateTextFile: (path: string) =>
    invoke<boolean>("validate_text_file", { path }),
  revealInFileManager: (path: string) => revealItemInDir(path),
  runSidecarVersion: (command: string) =>
    invoke<string>("run_sidecar_version", { command }),
  readClipboardText: () => invoke<string | null>("read_clipboard_text"),
  copyImageFromPathToClipboard: (path: string) =>
    invoke("copy_image_from_path_to_clipboard", { path }),
  storeImageBytes: (bytes: number[], originalName?: string) =>
    invoke<{ hash: string; path: string }>("store_image_bytes", {
      bytes,
      originalName,
    }),
  storeTextInCas: (content: string, extension: string) =>
    invoke<{ hash: string; path: string }>("store_text_in_cas", {
      content,
      extension,
    }),
};
