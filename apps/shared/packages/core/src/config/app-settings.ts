/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_PREFERENCES,
  CONFIG_FILE_NAME,
} from "./defaults";
import { resolveModelId, resolveOcrModelId } from "./models-config";
import { getConfigPort } from "../ports/config";

export interface UserPreferences {
  model: string;
  theme: "dark" | "light" | "system";
  ocrEnabled: boolean;
  autoExpandOCR: boolean;
  captureType: "traditional" | "squiggle";
  ocrLanguage: string;
}

export async function getDefaultPreferences(): Promise<UserPreferences> {
  return {
    model: DEFAULT_PREFERENCES.model,
    theme: DEFAULT_PREFERENCES.theme,
    ocrEnabled: DEFAULT_PREFERENCES.ocrEnabled,
    autoExpandOCR: DEFAULT_PREFERENCES.autoExpandOCR,
    captureType: DEFAULT_PREFERENCES.captureType,
    ocrLanguage: DEFAULT_PREFERENCES.ocrLanguage,
  };
}

export type WizardState = {
  step: number;
  isFinished: boolean;
  data?: Record<string, any>;
};

const USER_PREFERENCE_KEYS = [
  "model",
  "theme",
  "ocrEnabled",
  "autoExpandOCR",
  "captureType",
  "ocrLanguage",
] as const satisfies readonly (keyof UserPreferences)[];

function parseTomlString(rawValue: string): string {
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return JSON.parse(rawValue) as string;
  }

  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1);
  }

  throw new Error(`Invalid TOML string: ${rawValue}`);
}

function parsePreferencesToml(content: string): Partial<UserPreferences> {
  const parsed: Partial<UserPreferences> = {};

  for (const line of content.split(/\r?\n/u)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();

    switch (key) {
      case "model":
        parsed.model = parseTomlString(rawValue);
        break;
      case "theme":
        parsed.theme = parseTomlString(rawValue) as UserPreferences["theme"];
        break;
      case "captureType":
        parsed.captureType = parseTomlString(
          rawValue,
        ) as UserPreferences["captureType"];
        break;
      case "ocrLanguage":
        parsed.ocrLanguage = parseTomlString(rawValue);
        break;
      case "ocrEnabled":
        if (rawValue !== "true" && rawValue !== "false") {
          throw new Error(`Invalid TOML boolean for ${key}: ${rawValue}`);
        }
        parsed.ocrEnabled = rawValue === "true";
        break;
      case "autoExpandOCR":
        if (rawValue !== "true" && rawValue !== "false") {
          throw new Error(`Invalid TOML boolean for ${key}: ${rawValue}`);
        }
        parsed.autoExpandOCR = rawValue === "true";
        break;
      default:
        break;
    }
  }

  return parsed;
}

function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

function serializePreferencesToml(prefs: UserPreferences): string {
  return `${USER_PREFERENCE_KEYS.map((key) => {
    const value = prefs[key];
    const formattedValue =
      typeof value === "string" ? formatTomlString(value) : String(value);
    return `${key} = ${formattedValue}`;
  }).join("\n")}\n`;
}

export async function getWizardState(): Promise<WizardState> {
  try {
    return await getConfigPort().getWizardState();
  } catch (error) {
    console.warn("Wizard state check failed:", error);
    return { step: 0, isFinished: false };
  }
}

export async function setWizardState(state: WizardState): Promise<void> {
  try {
    await getConfigPort().setWizardState(state);
  } catch (error) {
    console.error("Failed to write wizard state via runtime port:", error);
  }
}

export async function hasConfigFile(): Promise<boolean> {
  try {
    return await getConfigPort().hasConfigFile(CONFIG_FILE_NAME);
  } catch (error) {
    console.warn("Config check failed:", error);
    return false;
  }
}

export async function loadPreferences(): Promise<UserPreferences> {
  try {
    const fileExists = await hasConfigFile();
    const defaultPrefs = await getDefaultPreferences();
    if (!fileExists) {
      await savePreferences(defaultPrefs);
      return defaultPrefs;
    }

    const content = await getConfigPort().readConfigFile(
      CONFIG_FILE_NAME,
    );
    const parsed = parsePreferencesToml(content);

    const normalizedModel = resolveModelId(parsed.model, defaultPrefs.model);
    const normalizedOcrLanguage = resolveOcrModelId(
      parsed.ocrLanguage,
      defaultPrefs.ocrLanguage,
    );
    const normalizedTheme =
      parsed.theme === "dark" ||
      parsed.theme === "light" ||
      parsed.theme === "system"
        ? parsed.theme
        : defaultPrefs.theme;
    const normalizedCaptureType =
      parsed.captureType === "traditional" || parsed.captureType === "squiggle"
        ? parsed.captureType
        : defaultPrefs.captureType;
    const merged = {
      ...defaultPrefs,
      ...parsed,
      model: normalizedModel,
      theme: normalizedTheme,
      ocrLanguage: normalizedOcrLanguage,
      captureType: normalizedCaptureType,
    };

    if (
      parsed.model !== normalizedModel ||
      parsed.theme !== normalizedTheme ||
      parsed.ocrLanguage !== normalizedOcrLanguage ||
      parsed.captureType !== normalizedCaptureType
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
    await getConfigPort().writeConfigFile(
      CONFIG_FILE_NAME,
      serializePreferencesToml(prefs),
    );
  } catch (error) {
    console.error("Failed to save preferences:", error);
    if (typeof error === "object" && error !== null) {
      console.error("Error details:", JSON.stringify(error));
    }
    throw error;
  }
}
