/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import {
  BaseDirectory,
  exists,
  readTextFile,
  writeTextFile,
  mkdir,
} from "@tauri-apps/plugin-fs";

import {
  DEFAULT_MODEL,
  DEFAULT_PROMPT,
  DEFAULT_THEME,
  PREFERENCES_FILE_NAME,
} from "../utils/constants";

export interface UserPreferences {
  model: string;
  theme: "dark" | "light";
  prompt: string;
  autoExpandOCR: boolean;
  captureType: "rectangular" | "squiggle";
}

export const defaultPreferences: UserPreferences = {
  model: DEFAULT_MODEL,
  theme: DEFAULT_THEME as "dark" | "light",
  prompt: DEFAULT_PROMPT,
  autoExpandOCR: true,
  captureType: "rectangular",
};

export async function hasPreferencesFile(): Promise<boolean> {
  try {
    return await exists(PREFERENCES_FILE_NAME, {
      baseDir: BaseDirectory.AppConfig,
    });
  } catch (error) {
    console.warn("Preferences check failed (fresh install?):", error);
    return false;
  }
}

export async function loadPreferences(): Promise<UserPreferences> {
  try {
    const fileExists = await hasPreferencesFile();
    if (!fileExists) {
      return defaultPreferences;
    }

    const content = await readTextFile(PREFERENCES_FILE_NAME, {
      baseDir: BaseDirectory.AppConfig,
    });
    const parsed = JSON.parse(content);

    return { ...defaultPreferences, ...parsed };
  } catch (error) {
    console.error("Failed to load preferences:", error);
    return defaultPreferences;
  }
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  try {
    await mkdir("", { baseDir: BaseDirectory.AppConfig, recursive: true });
    await writeTextFile(PREFERENCES_FILE_NAME, JSON.stringify(prefs, null, 2), {
      baseDir: BaseDirectory.AppConfig,
    });
  } catch (error) {
    console.error("Failed to save preferences:", error);
    if (typeof error === "object" && error !== null) {
      console.error("Error details:", JSON.stringify(error));
    }
    throw error;
  }
}
