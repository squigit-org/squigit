/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_FILE_NAME,
} from "./defaults";
import { resolveModelId, resolveOcrModelId } from "./models-config";
import { getPreferencesPort } from "../ports/preferences";

export interface UserPreferences {
  model: string;
  theme: "dark" | "light" | "system";
  prompt: string;
  ocrEnabled: boolean;
  autoExpandOCR: boolean;
  captureType: "rectangular" | "squiggle";
  ocrLanguage: string;
  activeAccount: string;
  soulMdName: string | null;
}

export async function getDefaultPreferences(): Promise<UserPreferences> {
  return {
    model: DEFAULT_PREFERENCES.model,
    theme: DEFAULT_PREFERENCES.theme,
    prompt: DEFAULT_PREFERENCES.prompt,
    ocrEnabled: DEFAULT_PREFERENCES.ocrEnabled,
    autoExpandOCR: DEFAULT_PREFERENCES.autoExpandOCR,
    captureType: DEFAULT_PREFERENCES.captureType,
    ocrLanguage: DEFAULT_PREFERENCES.ocrLanguage,
    activeAccount: DEFAULT_PREFERENCES.activeAccount,
    soulMdName: null,
  };
}

export async function hasAgreedFlag(): Promise<boolean> {
  try {
    return await getPreferencesPort().hasAgreedFlag();
  } catch (error) {
    console.warn("Agreed flag check failed:", error);
    return false;
  }
}

export async function setAgreedFlag(): Promise<void> {
  try {
    await getPreferencesPort().setAgreedFlag();
  } catch (error) {
    console.error("Failed to write agreed flag via runtime port:", error);
  }
}

export type WizardState = {
  step: number;
  isFinished: boolean;
  data?: Record<string, any>;
};

export async function getWizardState(): Promise<WizardState> {
  try {
    return await getPreferencesPort().getWizardState();
  } catch (error) {
    console.warn("Wizard state check failed:", error);
    return { step: 0, isFinished: false };
  }
}

export async function setWizardState(state: WizardState): Promise<void> {
  try {
    await getPreferencesPort().setWizardState(state);
  } catch (error) {
    console.error("Failed to write wizard state via runtime port:", error);
  }
}

export async function hasPreferencesFile(): Promise<boolean> {
  try {
    return await getPreferencesPort().hasPreferencesFile(PREFERENCES_FILE_NAME);
  } catch (error) {
    console.warn("Preferences check failed:", error);
    return false;
  }
}

export async function loadPreferences(): Promise<UserPreferences> {
  try {
    const fileExists = await hasPreferencesFile();
    const defaultPrefs = await getDefaultPreferences();
    if (!fileExists) {
      await savePreferences(defaultPrefs);
      return defaultPrefs;
    }

    const content = await getPreferencesPort().readPreferencesFile(
      PREFERENCES_FILE_NAME,
    );
    const parsed = JSON.parse(content) as Partial<UserPreferences>;

    const normalizedModel = resolveModelId(parsed.model, defaultPrefs.model);
    const normalizedOcrLanguage = resolveOcrModelId(
      parsed.ocrLanguage,
      defaultPrefs.ocrLanguage,
    );
    const merged = {
      ...defaultPrefs,
      ...parsed,
      model: normalizedModel,
      ocrLanguage: normalizedOcrLanguage,
    };

    if (
      parsed.model !== normalizedModel ||
      parsed.ocrLanguage !== normalizedOcrLanguage
    ) {
      await savePreferences(merged);
    }

    return merged;
  } catch (error) {
    console.error("Failed to load preferences:", error);
    return getDefaultPreferences();
  }
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  try {
    await getPreferencesPort().writePreferencesFile(
      PREFERENCES_FILE_NAME,
      JSON.stringify(prefs, null, 2),
    );
  } catch (error) {
    console.error("Failed to save preferences:", error);
    if (typeof error === "object" && error !== null) {
      console.error("Error details:", JSON.stringify(error));
    }
    throw error;
  }
}
