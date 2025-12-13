/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import "../../../../index.css";
import "./SettingsPanel.css";
import { MODELS, ModelType } from "../../../../../types";
import { MsgBox } from "../../../DialogBox";

// Sub-components
import { UserInfo } from "./UserInfo";
import { MainActions } from "./MainActions";
import { PersonalContext } from "./PersonalContext";

interface SettingsPanelProps {
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
  toggleSubview: (isActive: boolean) => void;
  toggleSettingsPanel: () => void;
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

export const SettingsPanel = forwardRef<
  { handleClose: () => Promise<boolean> },
  SettingsPanelProps
>(
  (
    {
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
      toggleSubview,
      toggleSettingsPanel,
    },
    ref
  ) => {
    const [isSubviewActive, setIsSubviewActive] = useState(false);
    const [localPrompt, setLocalPrompt] = useState(currentPrompt);
    const [localModel, setLocalModel] = useState(currentModel);
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const [isClosingPanel, setIsClosingPanel] = useState(false);
    const [isRotating, setIsRotating] = useState(false);

    const displayModel = isSubviewActive ? localModel : currentModel;

    const foundIndex = modelsWithInfo.findIndex((m) => m.id === displayModel);
    const currentModelIndex = foundIndex !== -1 ? foundIndex : 1;

    const selectedModel =
      modelsWithInfo[currentModelIndex] || modelsWithInfo[0];

    const handleNextModel = () => {
      const nextIndex = (currentModelIndex + 1) % modelsWithInfo.length;
      setLocalModel(modelsWithInfo[nextIndex].id as ModelType);
    };

    useEffect(() => {
      if (isSubviewActive) {
        setLocalPrompt(currentPrompt);
        setLocalModel(currentModel);
      }
    }, [isSubviewActive, currentPrompt, currentModel]);

    const handleSave = () => {
      onSave(localPrompt, localModel);
      setIsSubviewActive(false);
      toggleSubview(false);
    };

    const handleClose = async (): Promise<boolean> => {
      if (!isSubviewActive) {
        return true;
      }
      const isDirty =
        localPrompt !== currentPrompt || localModel !== currentModel;

      if (isDirty) {
        setIsClosingPanel(true);
        setShowUnsavedDialog(true);
        return false;
      } else {
        setIsSubviewActive(false);
        toggleSubview(false);
        return true;
      }
    };

    const handleBackPress = () => {
      const isDirty =
        localPrompt !== currentPrompt || localModel !== currentModel;
      if (isDirty) {
        setIsClosingPanel(false);
        setShowUnsavedDialog(true);
      } else {
        setIsSubviewActive(false);
        toggleSubview(false);
      }
    };

    useImperativeHandle(ref, () => ({
      handleClose,
    }));

    const handleClearCache = () => {
      invoke("clear_cache");
    };

    const handleOpenExternalUrl = (url: string) => {
      invoke("open_external_url", { url });
    };

    const handleReset = async () => {
      setIsRotating(true);
      const resetPrompt = await invoke<string>("reset_prompt");
      const resetModelId = await invoke<string>("reset_model");
      setLocalPrompt(resetPrompt);
      setLocalModel(resetModelId);
      setTimeout(() => setIsRotating(false), 1000);
    };

    const handleOpenSubview = () => {
      setIsSubviewActive(true);
      toggleSubview(true);
    };

    const handleDialogDiscard = () => {
      setShowUnsavedDialog(false);
      if (isClosingPanel) {
        toggleSettingsPanel();
      } else {
        setIsSubviewActive(false);
        toggleSubview(false);
      }
    };

    const handleDialogSave = () => {
      handleSave();
      setShowUnsavedDialog(false);
      if (isClosingPanel) {
        toggleSettingsPanel();
      }
    };

    // --- Render ---
    return (
      <div
        className={`settings-panel ${isSubviewActive ? "subview-active" : ""}`}
      >
        <MsgBox
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
          onClearCache={handleClearCache}
          onResetAPIKey={onResetAPIKey}
          onOpenSubview={handleOpenSubview}
          onReportBug={() =>
            handleOpenExternalUrl(
              "mailto:a7mddra@gmail.com?subject=This%20is%20a%20bug%20report%20from%20Spatialshot&body=Please%20describe%20the%20bug%20below:%0A%0A"
            )
          }
          onOpenGithub={() =>
            handleOpenExternalUrl("https://github.com/a7mddra/spatialshot")
          }
        />

        <PersonalContext
          isActive={isSubviewActive}
          localPrompt={localPrompt}
          setLocalPrompt={setLocalPrompt}
          selectedModel={selectedModel}
          onNextModel={handleNextModel}
          onBack={handleBackPress}
          onReset={handleReset}
          onSave={handleSave}
          isRotating={isRotating}
        />
      </div>
    );
  }
);
