/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RotateCw, ChevronRight, Save } from "lucide-react";
import { Dialog } from "../../components";
import { UserInfo, MainActions, GITHUB, MAILTO } from "../../features/settings";
import { MODELS, ModelType } from "../../lib/config/models";
import { DEFAULT_MODEL, DEFAULT_PROMPT } from "../../lib/utils/constants";
import styles from "./SettingsChild.module.css";

export interface SettingsChildProps {
  currentPrompt: string;
  currentModel: string;
  userName: string;
  userEmail: string;
  avatarSrc: string;
  onPromptChange: (prompt: string) => void;
  onModelChange: (model: string) => void;
  onSave: (prompt: string, model: string) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onResetAPIKey: () => void;
}

const modelsWithInfo = [
  {
    ...MODELS.find((m) => m.id === "gemini-2.5-pro")!,
    description: "Strongest",
  },
  {
    ...MODELS.find((m) => m.id === "gemini-2.5-flash")!,
    description: "Good",
  },
  {
    ...MODELS.find((m) => m.id === "gemini-flash-lite-latest")!,
    description: "Fastest",
  },
];

export const SettingsChild: React.FC<SettingsChildProps> = ({
  currentPrompt,
  currentModel,
  userName,
  userEmail,
  avatarSrc,
  onSave,
  onLogout,
  isDarkMode,
  onToggleTheme,
  onResetAPIKey,
}) => {
  const [localPrompt, setLocalPrompt] = useState(currentPrompt);
  const [localModel, setLocalModel] = useState(currentModel);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  const foundIndex = modelsWithInfo.findIndex((m) => m.id === localModel);
  const currentModelIndex = foundIndex !== -1 ? foundIndex : 1;
  const selectedModel =
    modelsWithInfo[currentModelIndex] || modelsWithInfo[0];

  const handleNextModel = () => {
    const nextIndex = (currentModelIndex + 1) % modelsWithInfo.length;
    const newModel = modelsWithInfo[nextIndex].id as ModelType;
    setLocalModel(newModel);
    onModelChange(newModel);
  };

  useEffect(() => {
    setLocalPrompt(currentPrompt);
    setLocalModel(currentModel);
  }, [currentPrompt, currentModel]);

  const handleSave = () => {
    onSave(localPrompt, localModel);
  };

  const handleReset = async () => {
    setIsRotating(true);
    setLocalPrompt(DEFAULT_PROMPT);
    setLocalModel(DEFAULT_MODEL);
    setTimeout(() => setIsRotating(false), 500);
  };

  const handleOpenExternalUrl = (url: string) => {
    invoke("open_external_url", { url });
  };

  const handleDialogDiscard = () => {
    setShowUnsavedDialog(false);
    setLocalPrompt(currentPrompt);
    setLocalModel(currentModel);
  };

  const handleDialogSave = () => {
    handleSave();
    setShowUnsavedDialog(false);
  };

  const handlePromptChange = (value: string) => {
    setLocalPrompt(value);
  };

  const handleModelChange = (model: string) => {
    setLocalModel(model);
    onModelChange(model);
  };

  const hasUnsavedChanges =
    localPrompt !== currentPrompt || localModel !== currentModel;

  return (
    <div className="flex h-full flex-col bg-neutral-transparent text-neutral-100 overflow-y-auto">
      <div className={styles["settings-content"]}>
        <Dialog
          isOpen={showUnsavedDialog}
          variant="warning"
          title="Unsaved Changes"
          message="Do you want to save your last changes ?"
          actions={[
            {
              label: "Discard",
              onClick: handleDialogDiscard,
              variant: "secondary",
            },
            {
              label: "Save",
              onClick: handleDialogSave,
              variant: "primary",
            },
          ]}
        />

        <UserInfo
          userName={userName}
          userEmail={userEmail}
          avatarSrc={avatarSrc}
          onLogout={onLogout}
        />

        <MainActions
          isDarkMode={isDarkMode}
          onToggleTheme={onToggleTheme}
          onResetAPIKey={onResetAPIKey}
          onOpenSubview={() => {}} // No subview in flat mode
          onReportBug={() => handleOpenExternalUrl(MAILTO)}
          onOpenGithub={() => handleOpenExternalUrl(GITHUB)}
        />

        {/* Personal Context - Flat Mode */}
        <div className={styles["personal-context-section"]}>
          <div className={styles["section-header"]}>
            <label htmlFor="promptTextarea">Customize Prompt 💬</label>
            <button
              className={styles["reset-btn"]}
              onClick={handleReset}
              title="Reset to defaults"
            >
              Reset{" "}
              <RotateCw
                size={14}
                className={isRotating ? styles["rotating"] : ""}
              />
            </button>
          </div>
          <div className={styles["prompt-container"]}>
            <textarea
              className={styles["prompt-textarea"]}
              id="promptTextarea"
              placeholder="Write a prompt..."
              value={localPrompt}
              onChange={(e) => handlePromptChange(e.target.value)}
            />
          </div>

          <div className={styles["form-group"]}>
            <label>Default Model 🧠</label>
            <div className={styles["model-switcher"]}>
              <div className={styles["model-info"]}>
                <span className={styles["model-name"]}>
                  {selectedModel?.name}
                </span>
                <span className={styles["model-description"]}>
                  {selectedModel?.description}
                </span>
              </div>
              <button
                className={styles["next-model-btn"]}
                onClick={handleNextModel}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <button
            className={styles["save-btn"]}
            onClick={handleSave}
            disabled={!hasUnsavedChanges}
          >
            <Save size={18} /> Save
          </button>
        </div>

        <div className={styles["footer"]}>
          <p>Spatialshot &copy; 2026</p>
        </div>
      </div>
    </div>
  );
};

