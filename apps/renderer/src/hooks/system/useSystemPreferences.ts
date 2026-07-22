/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import { commands } from "@/platform";
import { useSettingsStore } from "@/features/settings/settings.store";
import { useTheme } from "@/hooks/shared";

export const useSystemPreferences = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const preferencesHydrated = useSettingsStore((s) => s.preferencesHydrated);
  const themePreference = useSettingsStore((s) => s.themePreference);
  const startupModel = useSettingsStore((s) => s.startupModel);
  const setStartupModel = useSettingsStore((s) => s.setStartupModel);
  const editingModel = useSettingsStore((s) => s.editingModel);
  const setEditingModel = useSettingsStore((s) => s.setEditingModel);
  const sessionModel = useSettingsStore((s) => s.sessionModel);
  const setSessionModel = useSettingsStore((s) => s.setSessionModel);
  const startupEffort = useSettingsStore((s) => s.startupEffort);
  const setStartupEffort = useSettingsStore((s) => s.setStartupEffort);
  const editingEffort = useSettingsStore((s) => s.editingEffort);
  const setEditingEffort = useSettingsStore((s) => s.setEditingEffort);
  const sessionEffort = useSettingsStore((s) => s.sessionEffort);
  const setSessionEffort = useSettingsStore((s) => s.setSessionEffort);
  const autoExpandOCR = useSettingsStore((s) => s.autoExpandOCR);
  const setAutoExpandOCR = useSettingsStore((s) => s.setAutoExpandOCR);
  const ocrEnabled = useSettingsStore((s) => s.ocrEnabled);
  const setOcrEnabled = useSettingsStore((s) => s.setOcrEnabled);
  const captureType = useSettingsStore((s) => s.captureType);
  const setCaptureType = useSettingsStore((s) => s.setCaptureType);
  const startupOcrLanguage = useSettingsStore((s) => s.startupOcrLanguage);
  const setStartupOcrLanguage = useSettingsStore(
    (s) => s.setStartupOcrLanguage,
  );
  const sessionOcrLanguage = useSettingsStore((s) => s.sessionOcrLanguage);
  const setSessionOcrLanguage = useSettingsStore(
    (s) => s.setSessionOcrLanguage,
  );
  const hydratePreferences = useSettingsStore((s) => s.hydratePreferences);
  const updatePreferences = useSettingsStore((s) => s.updatePreferences);
  const updateThemePreference = (nextTheme: "dark" | "light" | "system") => {
    void updatePreferences({ theme: nextTheme });
  };

  useEffect(() => {
    if (!preferencesHydrated || themePreference === theme) return;
    setTheme(themePreference);
  }, [preferencesHydrated, setTheme, theme, themePreference]);

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

  return {
    theme: themePreference,
    resolvedTheme,
    setTheme: updateThemePreference,
    isDarkMode: resolvedTheme === "dark",

    startupModel,
    setStartupModel,
    editingModel,
    setEditingModel,
    sessionModel,
    setSessionModel,
    startupEffort,
    setStartupEffort,
    editingEffort,
    setEditingEffort,
    sessionEffort,
    setSessionEffort,

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
    hydratePreferences,

    refresh: () => Promise.resolve(),
  };
};
