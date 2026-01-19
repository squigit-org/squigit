/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { GITHUB, MAILTO } from "../..";
import { MODELS, ModelType } from "../../../../lib/config/models";
import { DEFAULT_MODEL, DEFAULT_PROMPT } from "../../../../lib/utils/constants";
import { Dialog } from "../../../../components";
import { UserInfo, MainActions, PersonalContext } from "../..";
import styles from "./SettingsPanel.module.css";

interface SettingsPanelProps {
  isOpen: boolean;
  isClosing: boolean;
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
      isOpen,
      isClosing,
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
    ref,
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

    const handleOpenExternalUrl = (url: string) => {
      invoke("open_external_url", { url });
    };

    const handleReset = async () => {
      setIsRotating(true);
      setLocalPrompt(DEFAULT_PROMPT);
      setLocalModel(DEFAULT_MODEL);
      setTimeout(() => setIsRotating(false), 500);
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

    return createPortal(
      <>
        <div
          className={styles["settings-overlay"]}
          onClick={(e) => {
            e.stopPropagation();
            handleClose().then((canClose) => {
              if (canClose) toggleSettingsPanel();
            });
          }}
        />

        <div
          className={`${styles["settings-panel"]} ${
            isOpen ? styles["active"] : ""
          } ${isClosing ? styles["closing"] : ""} ${
            isSubviewActive ? styles["subview-active"] : ""
          }`}
          id="panel"
        >
          <div className={styles["panel-content"]} id="settings-content">
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
              onOpenSubview={handleOpenSubview}
              onReportBug={() => handleOpenExternalUrl(MAILTO)}
              onOpenGithub={() => handleOpenExternalUrl(GITHUB)}
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

          <div className={styles["footer"]}>
            <p>Spatialshot &copy; 2026</p>
          </div>
        </div>
      </>,
      document.body,
    );
  },
);
