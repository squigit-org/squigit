/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from "react";
import "../index.css";
import "./SettingsPanel.css";

interface SettingsPanelProps {
  currentPrompt: string;
  userName: string;
  userEmail: string;
  avatarSrc: string;
  onSavePrompt: (newPrompt: string) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onResetAPIKey: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  currentPrompt,
  userName,
  userEmail,
  avatarSrc,
  onSavePrompt,
  onLogout,
  isDarkMode,
  onToggleTheme,
  onResetAPIKey,
}) => {
  const [isPromptViewActive, setIsPromptViewActive] = useState(false);
  const [promptText, setPromptText] = useState(currentPrompt);
  const [isEmailOverflowing, setIsEmailOverflowing] = useState(false);
  const emailRef = useRef<HTMLParagraphElement>(null);

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
    setPromptText(currentPrompt);
    setIsDirty(false);
  }, [currentPrompt]);

  const handleSavePrompt = () => {
    onSavePrompt(promptText);
    setIsDirty(false);
    setIsPromptViewActive(false);
  };

  const handleClose = async () => {
    if (isDirty) {
      const result = await (window as any).ipc.showUnsavedChangesAlert();
      if (result === "save") {
        handleSavePrompt();
      } else {
        setIsPromptViewActive(false);
        setPromptText(currentPrompt);
        setIsDirty(false);
      }
    } else {
      setIsPromptViewActive(false);
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

  const handleResetPrompt = async () => {
    if ("ipc" in window) {
      setIsRotating(true);
      const resetPrompt = await (window as any).ipc.resetPrompt();
      setPromptText(resetPrompt);
      setIsDirty(true);
      setTimeout(() => setIsRotating(false), 1000);
    }
  };

  return (
    <div
      className={`settings-panel ${isPromptViewActive ? "subview-active" : ""}`}
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
          onClick={() => setIsPromptViewActive(true)}
        >
          <div className="btn-content">
            <i className="fas fa-edit" />
            <div className="btn-text">Customize Prompt</div>
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
        className={`prompt-view ${isPromptViewActive ? "active" : ""}`}
        id="promptView"
      >
        <div className="prompt-header">
          <button className="back-btn" id="backPromptBtn" onClick={handleClose}>
            <i className="fas fa-arrow-left" />
          </button>
          <h2>Edit Prompt</h2>
          <button
            className={`reset-btn ${isRotating ? "rotating" : ""}`}
            id="resetPromptBtn"
            onClick={handleResetPrompt}
          >
            <i className="fas fa-sync-alt" />
          </button>
        </div>
        <div className="prompt-content">
          <textarea
            className="prompt-textarea"
            id="promptTextarea"
            placeholder="Write a prompt..."
            value={promptText}
            onChange={(e) => {
              setPromptText(e.target.value);
              setIsDirty(true);
            }}
          />
          <button
            className="save-btn"
            id="savePromptBtn"
            onClick={handleSavePrompt}
          >
            <i className="fas fa-save" /> Save Prompt
          </button>
        </div>
      </div>
    </div>
  );
};
