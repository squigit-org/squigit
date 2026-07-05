/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import type { WizardState } from "@squigit/core/config";
import { SettingsSection } from "@/features/settings";

export const useSystemState = () => {
  const [appName, setAppName] = useState<string>("Squigit");
  const [startupImage, setStartupImage] = useState<{
    path: string;
    mimeType: string;
    imageId: string;
    fromHistory?: boolean;
    tone?: string;
  } | null>(null);

  const [sessionThreadTitle, setSessionThreadTitle] = useState<string | null>(
    null,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");

  const [systemError, setSystemError] = useState<string | null>(null);
  const clearSystemError = () => setSystemError(null);

  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [wizardState, setWizardState] = useState<WizardState | null>(null);

  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section);
    setIsSettingsOpen(true);
  };

  return {
    appName,
    setAppName,
    startupImage,
    setStartupImage,
    sessionThreadTitle,
    setSessionThreadTitle,
    isSettingsOpen,
    setIsSettingsOpen,
    settingsSection,
    setSettingsSection,
    systemError,
    setSystemError,
    clearSystemError,
    prefsLoaded,
    setPrefsLoaded,
    wizardState,
    setWizardState,
    openSettings,
  };
};
