/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from "react";
import "../index.css";
import "./SettingsPanel.css";
import { MODELS, ModelType } from "../types";

interface SettingsPanelProps {
  currentPrompt: string;
  currentModel: string;
  userName: string;
  userEmail: string;
  avatarSrc: string;
  onSave: (settings: { prompt: string; model: string }) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onResetAPIKey: () => void;
}

const modelsWithInfo = [
  { ...MODELS.find(m => m.id === "gemini-2.5-pro"), description: "Strongest" },
  { ...MODELS.find(m => m.id === "gemini-2.5-flash"), description: "Good" },
  { ...MODELS.find(m => m.id === "gemini-flash-lite-latest"), description: "Fastest" },
];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
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
  const [isSubviewActive, setIsSubviewActive] = useState(false);
  const [prompt, setPrompt] = useState(currentPrompt);
  const [isEmailOverflowing, setIsEmailOverflowing] = useState(false);
  const emailRef = useRef<HTMLParagraphElement>(null);

  const initialModelIndex = modelsWithInfo.findIndex(m => m.id === currentModel);
  const [currentModelIndex, setCurrentModelIndex] = useState(initialModelIndex >= 0 ? initialModelIndex : 0);

  const handleNextModel = () => {
    setCurrentModelIndex((prevIndex) => {
      const nextIndex = (prevIndex + 1) % modelsWithInfo.length;
      setIsDirty(true);
      return nextIndex;
    });
  };

  const selectedModel = modelsWithInfo[currentModelIndex];


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

  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setPrompt(currentPrompt);
    const newModelIndex = modelsWithInfo.findIndex(m => m.id === currentModel);
    setCurrentModelIndex(newModelIndex >= 0 ? newModelIndex : 0);
    setIsDirty(false);
  }, [currentPrompt, currentModel]);

  const handleSave = () => {
    onSave({ prompt: prompt, model: selectedModel.id as ModelType });
    setIsDirty(false);
    setIsSubviewActive(false);
  };

  const handleClose = async () => {
    if (isDirty) {
      const result = await (window as any).ipc.showUnsavedChangesAlert();
      if (result === "save") {
        handleSave();
      } else {
        setIsSubviewActive(false);
        setPrompt(currentPrompt);
        const newModelIndex = modelsWithInfo.findIndex(m => m.id === currentModel);
        setCurrentModelIndex(newModelIndex >= 0 ? newModelIndex : 0);
        setIsDirty(false);
      }
    } else {
      setIsSubviewActive(false);
    }
  };

  const handleClearCache = () => {
    if ("ipc" in window) {
      (window as any).ipc.clearCache();
    }
  };

  const handleOpenExternalUrl = (url: string) => {
    if ("ipc" in window) {
      (window as any).ipc.openExternalUrl(url);
    }
  };

  const [isRotating, setIsRotating] = useState(false);

  const handleReset = async () => {
    if ("ipc" in window) {
      setIsRotating(true);
      const resetPrompt = await (window as any).ipc.resetPrompt();
      const resetModelId = await (window as any).ipc.resetModel();
      setPrompt(resetPrompt);
      const newModelIndex = modelsWithInfo.findIndex(m => m.id === resetModelId);
      setCurrentModelIndex(newModelIndex >= 0 ? newModelIndex : 0);
      setIsDirty(true);
      setTimeout(() => setIsRotating(false), 1000);
    }
  };

  return (
    <div
      className={`settings-panel ${isSubviewActive ? "subview-active" : ""}`}
    >
      <div className="user-info">
        <div className="user-info-main">
          <img className="avatar" src={avatarSrc} alt="User avatar" />
          <div className="user-details-wrapper">
            <div className="user-details">
              <h3>{userName}</h3>
              <p ref={emailRef} className={isEmailOverflowing ? "marquee" : ""}>
                {isEmailOverflowing ? (
                  <span>
                    {new Array(200).fill(userEmail).join("\u00A0\u00A0\u00A0")}
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
              "mailto:a7mddra@gmail.com?subject=This%20is%20a%20bug%20report%20from%20SpatialShot&body=Please%20describe%20the%20bug%20below:%0A%0A"
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
        <button
          className="btn"
          id="promptBtn"
          onClick={() => setIsSubviewActive(true)}
        >
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
          <button className="back-btn" id="backPromptBtn" onClick={handleClose}>
            <i className="fas fa-arrow-left" />
          </button>
          <button
            className={`reset-btn ${isRotating ? "rotating" : ""}`}
            id="resetPromptBtn"
            onClick={handleReset}
          >
            <i className="fas fa-sync-alt" />
          </button>
        </div>
        <div className="subview-content">
          <label htmlFor="promptTextarea">Customize Prompt</label>
          <textarea
            className="prompt-textarea"
            id="promptTextarea"
            placeholder="Write a prompt..."
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setIsDirty(true);
            }}
          />

          <div className="form-group">
            <label>Default Model</label>
            <div className="model-switcher">
              <div className="model-info">
                <span className="model-name">{selectedModel.name}</span>
                <span className="model-description">{selectedModel.description}</span>
              </div>
              <button className="next-model-btn" onClick={handleNextModel}>
                <i className="fas fa-chevron-right" />
              </button>
            </div>
          </div>

          <button
            className="save-btn"
            id="savePromptBtn"
            onClick={handleSave}
          >
            <i className="fas fa-save" /> Save
          </button>
        </div>
      </div>
    </div>
  );
};
