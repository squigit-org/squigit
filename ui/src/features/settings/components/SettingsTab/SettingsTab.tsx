/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";

import styles from "./SettingsTab.module.css";
import {
  GeneralSection,
  ModelsSection,
  PersonalContextSection,
  ApiKeysSection,
  SupportSection,
  SettingsPanel,
} from "@/features/settings";
import { UserPreferences } from "@/lib/config/preferences";
import { Profile } from "@/lib/api/tauri/commands";

export interface SettingsTabProps {
  currentPrompt: string;
  currentModel: string;
  onPromptChange?: (prompt: string) => void;
  onModelChange?: (model: string) => void;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;

  autoExpandOCR: boolean;
  ocrEnabled: boolean;
  ocrLanguage: string;
  downloadedOcrLanguages: string[];
  captureType: "rectangular" | "squiggle";
  geminiKey: string;
  imgbbKey: string;
  onSetAPIKey: (
    provider: "google ai studio" | "imgbb" | "gemini",
    key: string,
  ) => Promise<boolean>;
  forceTopic?: Topic;
}

export type Topic =
  | "General"
  | "Models"
  | "Personal Context"
  | "Providers & Keys"
  | "Help & Support"
  | "Docs";

const SettingsTabComponent: React.FC<SettingsTabProps> = ({
  currentPrompt,
  currentModel,
  updatePreferences,
  isDarkMode,
  onToggleTheme,
  autoExpandOCR,
  ocrEnabled,
  ocrLanguage,
  downloadedOcrLanguages,
  captureType,
  geminiKey,
  imgbbKey,
  onSetAPIKey,
  forceTopic,
}) => {
  const [activeTopic, setActiveTopic] = useState<Topic>("General");

  React.useEffect(() => {
    if (forceTopic) {
      setActiveTopic(forceTopic);
    }
  }, [forceTopic]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const apiSectionRef = useRef<HTMLDivElement>(null);

  const [localPrompt, setLocalPrompt] = useState(currentPrompt);
  const [localModel, setLocalModel] = useState(currentModel);

  const handleToggleAutoExpand = (checked: boolean) => {
    updatePreferences({ autoExpandOCR: checked });
  };

  const handleToggleOcrEnabled = (checked: boolean) => {
    // If disabling OCR, also disable auto-expand
    if (!checked) {
      updatePreferences({ ocrEnabled: checked, autoExpandOCR: false });
    } else {
      updatePreferences({ ocrEnabled: checked });
    }
  };

  const handleCaptureTypeChange = (type: "rectangular" | "squiggle") => {
    updatePreferences({ captureType: type });
  };

  const handleToggleTheme = () => {
    // Toggle theme via updatePreferences
    const newTheme = isDarkMode ? "light" : "dark";
    updatePreferences({ theme: newTheme });
  };

  const renderContent = () => {
    switch (activeTopic) {
      case "General":
        return (
          <GeneralSection
            isDarkMode={isDarkMode}
            onToggleTheme={onToggleTheme}
            autoExpandOCR={autoExpandOCR}
            onToggleAutoExpand={handleToggleAutoExpand}
            ocrEnabled={ocrEnabled}
            onToggleOcrEnabled={handleToggleOcrEnabled}
            captureType={captureType}
            onCaptureTypeChange={handleCaptureTypeChange}
          />
        );
      case "Providers & Keys":
        return (
          <ApiKeysSection
            geminiKey={geminiKey}
            imgbbKey={imgbbKey}
            onSetAPIKey={onSetAPIKey}
            ref={apiSectionRef}
          />
        );
      case "Models":
        return (
          <ModelsSection
            localModel={localModel}
            currentModel={currentModel}
            setLocalModel={setLocalModel}
            ocrLanguage={ocrLanguage}
            downloadedOcrLanguages={downloadedOcrLanguages}
            updatePreferences={updatePreferences}
          />
        );
      case "Personal Context":
        return (
          <PersonalContextSection
            localPrompt={localPrompt}
            currentPrompt={currentPrompt}
            setLocalPrompt={setLocalPrompt}
            updatePreferences={updatePreferences}
          />
        );
      case "Help & Support":
        return <SupportSection type={activeTopic} />;
      default:
        return null;
    }
  };

  return (
    <div className={styles.container}>
      <SettingsPanel
        activeTopic={activeTopic}
        setActiveTopic={setActiveTopic}
      />

      <div className={styles.contentArea} ref={scrollRef}>
        <div className={styles.contentWrapper}>{renderContent()}</div>
      </div>
    </div>
  );
};

/**
 * Memoized SettingsTab - prevents unnecessary re-renders when chat view toggles.
 */
export const SettingsTab = React.memo(SettingsTabComponent);
