/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";

import styles from "./SettingsTab.module.css";
import { GeneralSection } from "../GeneralSection/GeneralSection";
import { ModelsSection } from "../ModelsSection/ModelsSection";
import { PersonalContextSection } from "../PersonalSection/PersonalContextSection";
import { ApiKeysSection } from "../ApiKeysSection/ApiKeysSection";
import { SupportSection } from "../SupportSection/SupportSection";
import { SettingsPanel } from "../SettingsPanel/SettingsPanel";

export interface SettingsTabProps {
  currentPrompt: string;
  currentModel: string;
  userName: string;
  userEmail: string;
  avatarSrc: string;
  originalPicture: string | null;
  onPromptChange: (prompt: string) => void;
  onModelChange: (model: string) => void;
  onSave: (
    prompt: string,
    model: string,
    autoExpandOCR?: boolean,
    captureType?: "rectangular" | "squiggle",
  ) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;

  autoExpandOCR: boolean;
  setAutoExpandOCR: (enabled: boolean) => void;
  captureType: "rectangular" | "squiggle";
  setCaptureType: (type: "rectangular" | "squiggle") => void;
  geminiKey: string;
  imgbbKey: string;
  onSetAPIKey: (provider: "gemini" | "imgbb", key: string) => Promise<boolean>;
  isChatPanelOpen: boolean;
}

export type Topic =
  | "General"
  | "Models"
  | "Personal Context"
  | "Providers & Keys"
  | "Help & Support"
  | "Docs";

export const SettingsTab: React.FC<SettingsTabProps> = ({
  currentPrompt,
  currentModel,
  userName,
  userEmail,
  avatarSrc,
  originalPicture,
  onSave,
  onLogout,
  isDarkMode,
  onToggleTheme,
  autoExpandOCR,
  setAutoExpandOCR,
  captureType,
  setCaptureType,
  geminiKey,
  imgbbKey,
  onSetAPIKey,
  onPromptChange,
  onModelChange,
  isChatPanelOpen,
}) => {
  const [activeTopic, setActiveTopic] = useState<Topic>("General");
  const scrollRef = useRef<HTMLDivElement>(null);
  const apiSectionRef = useRef<HTMLDivElement>(null);

  const [localPrompt, setLocalPrompt] = useState(currentPrompt);
  const [localModel, setLocalModel] = useState(currentModel);
  const [localAutoExpand, setLocalAutoExpand] = useState(autoExpandOCR);
  const [localCaptureType, setLocalCaptureType] = useState(captureType);

  useEffect(() => {
    setLocalPrompt(currentPrompt);
    setLocalModel(currentModel);
    setLocalAutoExpand(autoExpandOCR);
    setLocalCaptureType(captureType);
  }, [currentPrompt, currentModel, autoExpandOCR, captureType]);

  const handleToggleAutoExpand = (checked: boolean) => {
    setLocalAutoExpand(checked);
    onSave(localPrompt, localModel, checked, localCaptureType);
    setAutoExpandOCR(checked);
  };

  const handleCaptureTypeChange = (type: "rectangular" | "squiggle") => {
    setLocalCaptureType(type);
    onSave(localPrompt, localModel, localAutoExpand, type);
    setCaptureType(type);
  };

  const handleSavePersonalContext = () => {
    onSave(localPrompt, localModel, localAutoExpand, localCaptureType);
    onPromptChange(localPrompt);
    onModelChange(localModel);
  };

  const renderContent = () => {
    switch (activeTopic) {
      case "General":
        return (
          <GeneralSection
            isDarkMode={isDarkMode}
            onToggleTheme={onToggleTheme}
            autoExpandOCR={localAutoExpand}
            onToggleAutoExpand={handleToggleAutoExpand}
            captureType={localCaptureType}
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
            onSavePersonalContext={handleSavePersonalContext}
            localModel={localModel}
            currentModel={currentModel}
            setLocalModel={setLocalModel}
            isChatPanelOpen={isChatPanelOpen}
          />
        );
      case "Personal Context":
        return (
          <PersonalContextSection
            localPrompt={localPrompt}
            setLocalPrompt={setLocalPrompt}
            onSavePersonalContext={handleSavePersonalContext}
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
      {/* Left Sidebar */}
      <SettingsPanel
        activeTopic={activeTopic}
        setActiveTopic={setActiveTopic}
        userName={userName}
        userEmail={userEmail}
        avatarSrc={avatarSrc}
        originalPicture={originalPicture}
        onLogout={onLogout}
      />

      {/* Right Content */}
      <div className={styles.contentArea} ref={scrollRef}>
        <div className={styles.contentWrapper}>{renderContent()}</div>
      </div>
    </div>
  );
};
