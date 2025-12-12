/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useEffect,
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import "../index.css";
import "./SettingsPanel.css";
import { MODELS, ModelType } from "../types";
import { MsgBox } from "./MsgBox";

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
    ...MODELS.find((m) => m.id === "gemini-2.5-pro"),
    description: "Strongest",
  },
  { ...MODELS.find((m) => m.id === "gemini-2.5-flash"), description: "Good" },
  {
    ...MODELS.find((m) => m.id === "gemini-flash-lite-latest"),
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
      onPromptChange,
      onModelChange,
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
    const [isEmailOverflowing, setIsEmailOverflowing] = useState(false);
    const emailRef = useRef<HTMLParagraphElement>(null);

    const [localPrompt, setLocalPrompt] = useState(currentPrompt);
    const [localModel, setLocalModel] = useState(currentModel);

    const displayModel = isSubviewActive ? localModel : currentModel;
    const currentModelIndex =
      modelsWithInfo.findIndex((m) => m.id === displayModel) ?? 1;
    const selectedModel = modelsWithInfo[currentModelIndex];

    const handleNextModel = () => {
      const nextIndex = (currentModelIndex + 1) % modelsWithInfo.length;
      setLocalModel(modelsWithInfo[nextIndex].id as ModelType);
    };

    useEffect(() => {
      const checkOverflow = () => {
        if (emailRef.current) {
          const isOverflowing =
            emailRef.current.scrollWidth > emailRef.current.clientWidth;
          setIsEmailOverflowing(isOverflowing);
        }
      };

      checkOverflow();
      window.addEventListener("resize", checkOverflow);
      return () => window.removeEventListener("resize", checkOverflow);
    }, [userEmail]);

    useEffect(() => {
      if (isSubviewActive) {
        setLocalPrompt(currentPrompt);
        setLocalModel(currentModel);
      }
    }, [isSubviewActive]);

    const handleSave = () => {
      onSave(localPrompt, localModel);
      setIsSubviewActive(false);
      toggleSubview(false);
    };

    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const [isClosingPanel, setIsClosingPanel] = useState(false);

    const handleClose = async (): Promise<boolean> => {
      if (!isSubviewActive) {
        return true;
      }

      const isDirty =
        localPrompt !== currentPrompt || localModel !== currentModel;

      if (isDirty) {
        setIsClosingPanel(true); // External close, so plan to close panel
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
        setIsClosingPanel(false); // Just closing subview
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

    const [isRotating, setIsRotating] = useState(false);

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

    return (
      <div
        className={`settings-panel ${isSubviewActive ? "subview-active" : ""}`}
      >
        <MsgBox
          isOpen={showUnsavedDialog}
          variant="warning"
          title="Unsaved Changes"
          message="You have unsaved changes. Do you want to save them?"
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
        <div className="user-info">
          <div className="user-info-main">
            <img className="avatar" src={avatarSrc} alt="User avatar" />
            <div className="user-details-wrapper">
              <div className="user-details">
                <h3>{userName}</h3>
                <p
                  ref={emailRef}
                  className={isEmailOverflowing ? "marquee" : ""}
                >
                  {isEmailOverflowing ? (
                    <span>
                      {new Array(200)
                        .fill(userEmail)
                        .join("\u00A0\u00A0\u00A0")}
                    </span>
                  ) : (
                    userEmail
                  )}
                </p>
              </div>
            </div>
          </div>
          <button
            className="logout-btn"
            title="Log Out"
            aria-label="Log out"
            onClick={onLogout}
          >
            <i className="fas fa-sign-out-alt" />
          </button>
        </div>
        <div className="button-group">
          <button className="btn" id="darkModeBtn" onClick={onToggleTheme}>
            <div className="btn-content">
              <i className="fas fa-moon" />
              <div className="btn-text">Dark Mode</div>
            </div>
            <label className="toggle" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                id="darkModeToggle"
                checked={isDarkMode}
                onChange={onToggleTheme}
              />
              <span className="toggle-slider" />
            </label>
          </button>

          <button className="btn" id="clearCacheBtn" onClick={handleClearCache}>
            <div className="btn-content">
              <i className="fas fa-broom" />
              <div className="btn-text">Clear Cache</div>
            </div>
          </button>
          <button
            className="btn"
            onClick={() =>
              handleOpenExternalUrl(
                "mailto:a7mddra@gmail.com?subject=This%20is%20a%20bug%20report%20from%20Spatialshot&body=Please%20describe%20the%20bug%20below:%0A%0A"
              )
            }
          >
            <div className="btn-content">
              <i className="fas fa-bug" />
              <div className="btn-text">Report Bug</div>
            </div>
          </button>
          <button className="btn" id="resetAPIKeyBtn" onClick={onResetAPIKey}>
            <div className="btn-content">
              <i className="fas fa-key" />
              <div className="btn-text">Reset API Key</div>
            </div>
          </button>
          <button className="btn" id="promptBtn" onClick={handleOpenSubview}>
            <div className="btn-content">
              <i className="fas fa-edit" />
              <div className="btn-text">Personal Context</div>
            </div>
            <div className="btn-arrow">
              <i className="fas fa-chevron-right" />
            </div>
          </button>
          <button
            className="btn"
            onClick={() =>
              handleOpenExternalUrl("https://github.com/a7mddra/spatialshot")
            }
          >
            <div className="btn-content">
              <i className="fab fa-github" />
              <div className="btn-text">GitHub Repository</div>
            </div>
          </button>
        </div>

        <div
          className={`subview ${isSubviewActive ? "active" : ""}`}
          id="promptView"
        >
          <div className="subview-header">
            <button
              className="back-btn"
              id="backPromptBtn"
              onClick={handleBackPress}
            >
              <i className="fas fa-arrow-left" />
            </button>
            <button
              className="reset-btn"
              id="resetPromptBtn"
              onClick={handleReset}
            >
              Reset <i className={`fas fa-sync-alt ${isRotating ? "rotating" : ""}`} />
            </button>
          </div>
          <div className="subview-content">
            <label htmlFor="promptTextarea">Customize Prompt</label>
            <textarea
              className="prompt-textarea"
              id="promptTextarea"
              placeholder="Write a prompt..."
              value={localPrompt}
              onChange={(e) => {
                setLocalPrompt(e.target.value);
              }}
            />

            <div className="form-group">
              <label>Default Model</label>
              <div className="model-switcher">
                <div className="model-info">
                  <span className="model-name">{selectedModel?.name}</span>
                  <span className="model-description">
                    {selectedModel?.description}
                  </span>
                </div>
                <button className="next-model-btn" onClick={handleNextModel}>
                  <i className="fas fa-chevron-right" />
                </button>
              </div>
            </div>

            <button
              className="save-btn"
              id="saveBtn"
              onClick={handleSave}
            >
              <i className="fas fa-save" /> Save
            </button>
          </div>
        </div>
      </div>
    );
  }
);
