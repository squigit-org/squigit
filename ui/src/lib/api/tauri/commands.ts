/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import { invoke } from "@tauri-apps/api/core";
import { Profile, UserData, ImageResponse } from "./types";
export * from "./types";

export const commands = {
  // Image Processing
  processImagePath: (path: string) =>
    invoke<{ hash: string; path: string }>("process_image_path", { path }),
  processImageBytes: (bytes: number[]) =>
    invoke<{ hash: string; path: string }>("process_image_bytes", { bytes }),
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
      plaintext: key, // "plaintext"
      profileId,
    }),
  startGoogleAuth: () => invoke("start_google_auth"),
  cancelGoogleAuth: () => invoke("cancel_google_auth"),
  logout: () => invoke("logout"),
  getUserData: () => invoke<UserData>("get_user_data"),

  // Profile Management
  getActiveProfile: () => invoke<Profile | null>("get_active_profile"),
  getActiveProfileId: () => invoke<string | null>("get_active_profile_id"),
  listProfiles: () => invoke<Profile[]>("list_profiles"),
  setActiveProfile: (profileId: string) =>
    invoke("set_active_profile", { profileId }),
  deleteProfile: (profileId: string) => invoke("delete_profile", { profileId }),
  hasProfiles: () => invoke<boolean>("has_profiles"),
  getProfileCount: () => invoke<number>("get_profile_count"),

  // Window Mgmt
  openImgbbWindow: () => invoke("open_imgbb_window"),
  closeImgbbWindow: () => invoke("close_imgbb_window"),
  resizeWindow: (width: number, height: number, show: boolean = true) =>
    invoke("resize_window", { width, height, show }),
  setBackgroundColor: (color: string) =>
    invoke("set_background_color", { color }),

  // Utils
  openExternalUrl: (url: string) => invoke("open_external_url", { url }),
};
