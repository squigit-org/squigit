/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import { commands } from "@/platform";
import { DEFAULT_OCR_MODEL_ID, resolveOcrModelId } from "@squigit/core/config";
import {
  type UserPreferences,
  loadPreferences,
  savePreferences,
} from "@squigit/core/config";
import { useTheme } from "@/hooks/shared";
import { getConfigPort } from "@squigit/core/ports";

const RULES_FILE_NAME = "RULES.md";

export const useSystemPreferences = () => {
  const [prompt, setPrompt] = useState("");

  const ensureRulesFileExists = useCallback(async () => {
    const configPort = getConfigPort();
    const exists = await configPort.hasConfigFile(RULES_FILE_NAME);
    if (!exists) {
      await configPort.writeConfigFile(RULES_FILE_NAME, "");
    }
    return configPort;
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const configPort = await ensureRulesFileExists();
      const nextPrompt = await configPort.readConfigFile(RULES_FILE_NAME);
      setPrompt(nextPrompt);
    } catch (e) {
      console.error("Failed to fetch RULES.md:", e);
      setPrompt("");
    }
  }, [ensureRulesFileExists]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const { theme, resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const updateNativeBg = async () => {
      const color = resolvedTheme === "dark" ? "#0a0a0a" : "#ffffff";
      try {
        await commands.setBackgroundColor(color);
      } catch (e) {
        console.error("Failed to set native background color", e);
      }
    };
    updateNativeBg();
  }, [resolvedTheme]);

  const [startupModel, setStartupModel] = useState<string>("");
  const [editingModel, setEditingModel] = useState<string>("");
  const [sessionModel, setSessionModel] = useState<string>("");
  const [autoExpandOCR, setAutoExpandOCR] = useState<boolean>(true);
  const [ocrEnabled, setOcrEnabled] = useState<boolean>(true);
  const [captureType, setCaptureType] = useState<"traditional" | "squiggle">(
    "traditional",
  );
  const [startupOcrLanguage, setStartupOcrLanguage] =
    useState<string>(DEFAULT_OCR_MODEL_ID);
  const [sessionOcrLanguage, setSessionOcrLanguage] =
    useState<string>(DEFAULT_OCR_MODEL_ID);

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    const normalizedUpdatedOcrLanguage =
      updates.ocrLanguage !== undefined
        ? resolveOcrModelId(updates.ocrLanguage)
        : undefined;

    if (updates.model !== undefined) {
      setStartupModel(updates.model);
      setEditingModel(updates.model);
      setSessionModel(updates.model);
    }
    if (updates.autoExpandOCR !== undefined) {
      setAutoExpandOCR(updates.autoExpandOCR);
    }
    if (updates.ocrEnabled !== undefined) {
      setOcrEnabled(updates.ocrEnabled);
      if (!updates.ocrEnabled) {
        setSessionOcrLanguage("");
      } else {
        setSessionOcrLanguage(
          normalizedUpdatedOcrLanguage ?? resolveOcrModelId(startupOcrLanguage),
        );
      }
    }
    if (updates.captureType !== undefined) {
      setCaptureType(updates.captureType);
    }
    if (normalizedUpdatedOcrLanguage !== undefined) {
      setStartupOcrLanguage(normalizedUpdatedOcrLanguage);
      if (ocrEnabled && updates.ocrEnabled === undefined) {
        setSessionOcrLanguage(normalizedUpdatedOcrLanguage);
      }
    }
    if (updates.theme !== undefined) {
      setTheme(updates.theme);
    }

    try {
      const currentPrefs = await loadPreferences();
      await savePreferences({ ...currentPrefs, ...updates });
    } catch (e) {
      console.error("Failed to save preferences:", e);
    }
  };

  const updatePrompt = useCallback(async (prompt: string) => {
    try {
      const configPort = await ensureRulesFileExists();
      await configPort.writeConfigFile(RULES_FILE_NAME, prompt);
      setPrompt(prompt);
    } catch (e) {
      console.error("Failed to update RULES.md:", e);
    }
  }, [ensureRulesFileExists]);

  return {
    theme,
    resolvedTheme,
    setTheme,
    isDarkMode: resolvedTheme === "dark",

    startupModel,
    setStartupModel,
    editingModel,
    setEditingModel,
    sessionModel,
    setSessionModel,

    autoExpandOCR,
    setAutoExpandOCR,
    ocrEnabled,
    setOcrEnabled,
    captureType,
    setCaptureType,
    startupOcrLanguage,
    setStartupOcrLanguage,
    sessionOcrLanguage,
    setSessionOcrLanguage,

    updatePreferences,

    prompt,
    updatePrompt,
    refresh: fetchConfig,
  };
};
