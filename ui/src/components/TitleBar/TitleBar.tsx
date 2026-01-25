/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ForwardedRef, useEffect, useState } from "react";
import {
  RotateCw,
  Plus,
  Settings,
  SquarePen,
  Minus,
  PanelLeft,
  X,
} from "lucide-react";
import { ModelSwitcher } from "./ModelSwitcher";
import { SettingsPanel } from "../../features/settings";
import { invoke } from "@tauri-apps/api/core";
import styles from "./TitleBar.module.css";

type Platform = "macos" | "linux" | "windows";

interface TitleBarProps {
  chatTitle: string;
  onReload: () => void;
  isRotating: boolean;
  currentModel: string;
  onModelChange: (model: string) => void;
  isLoading: boolean;

  isPanelActive: boolean;
  toggleSettingsPanel: () => void;
  isPanelVisible: boolean;
  isPanelActiveAndVisible: boolean;
  isPanelClosing: boolean;
  settingsButtonRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  settingsPanelRef: ForwardedRef<{ handleClose: () => Promise<boolean> }>;
  prompt: string;
  editingModel: string;
  setPrompt: (prompt: string) => void;
  onEditingModelChange: (model: string) => void;
  userName: string;
  userEmail: string;
  avatarSrc: string;
  onSave: (prompt: string, model: string) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onResetAPIKey: () => void;
  toggleSubview: (isActive: boolean) => void;
  onNewSession: () => void;
  hasImageLoaded: boolean;
  toggleChatPanel: () => void;
  isChatPanelOpen: boolean;
}

const detectPlatform = (): Platform => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  console.log("TitleBar Platform Detection - UA:", userAgent);
  if (userAgent.includes("mac os")) return "macos";
  if (userAgent.includes("windows")) return "windows";
  // Default to linux (traffic lights) if not explicitly Mac or Windows
  return "linux";
};

const TrafficLights: React.FC = () => {
  const handleClose = () => invoke("close_window");
  const handleMinimize = () => invoke("minimize_window");
  const handleMaximize = () => invoke("maximize_window");

  return (
    <div className={styles.trafficLights}>
      <button
        className={`${styles.trafficButton} ${styles.close}`}
        onClick={handleClose}
        title="Close"
      >
        <X className={styles.icon} />
      </button>
      <button
        className={`${styles.trafficButton} ${styles.minimize}`}
        onClick={handleMinimize}
        title="Minimize"
      >
        <Minus className={styles.icon} />
      </button>
      <button
        className={`${styles.trafficButton} ${styles.maximize}`}
        onClick={handleMaximize}
        title="Maximize"
      >
        <Plus className={styles.icon} />
      </button>
    </div>
  );
};

const WindowsControls: React.FC = () => {
  const handleClose = () => invoke("close_window");
  const handleMinimize = () => invoke("minimize_window");
  const handleMaximize = () => invoke("maximize_window");

  return (
    <div className={styles.windowsControls}>
      <button
        className={`${styles.windowsButton} ${styles.winMinimize}`}
        onClick={handleMinimize}
        title="Minimize"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.1"
        >
          <line x1="1" y1="6" x2="11" y2="6" />
        </svg>
      </button>
      <button
        className={`${styles.windowsButton} ${styles.winMaximize}`}
        onClick={handleMaximize}
        title="Maximize"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.1"
        >
          <rect x="1" y="1" width="10" height="10" />
        </svg>
      </button>
      <button
        className={`${styles.windowsButton} ${styles.winClose}`}
        onClick={handleClose}
        title="Close"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.1"
        >
          <line x1="1" y1="1" x2="11" y2="11" />
          <line x1="11" y1="1" x2="1" y2="11" />
        </svg>
      </button>
    </div>
  );
};

export const TitleBar: React.FC<TitleBarProps> = ({
  chatTitle,
  onReload,
  isRotating,
  currentModel,
  onModelChange,
  isLoading,
  isPanelActive,
  toggleSettingsPanel,
  isPanelVisible,
  isPanelActiveAndVisible,
  isPanelClosing,
  settingsButtonRef,
  panelRef,
  settingsPanelRef,
  prompt,
  editingModel,
  setPrompt,
  onEditingModelChange,
  userName,
  userEmail,
  avatarSrc,
  onSave,
  onLogout,
  isDarkMode,
  onToggleTheme,
  onResetAPIKey,
  toggleSubview,
  onNewSession,
  hasImageLoaded,
  toggleChatPanel,
  isChatPanelOpen,
}) => {
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform());

  const isUnix = platform === "macos" || platform === "linux";

  return (
    <header className={styles.header} data-tauri-drag-region>
      <h1 className={styles.chatTitle}>{chatTitle}</h1>

      <div className={styles.leftSection}>
        {isUnix && <TrafficLights />}

        <div className={styles.controlsWrapper}>
          <button
            onClick={toggleChatPanel}
            className={`${styles.iconButton} ${
              isChatPanelOpen ? styles.active : ""
            }`}
            title="Recent Chats"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <path
                d="M9 3V21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H9Z"
                fill={isChatPanelOpen ? "currentColor" : "none"}
                stroke={isChatPanelOpen ? "none" : "currentColor"}
              />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        </div>
      </div>

      <div className={styles.rightSection}>
        {hasImageLoaded && (
          <button
            onClick={onReload}
            className={styles.iconButton}
            title="Reload chat"
            disabled={isRotating || isLoading}
          >
            <RotateCw size={20} className={isRotating ? styles.rotating : ""} />
          </button>
        )}

        <ModelSwitcher
          currentModel={currentModel}
          onModelChange={onModelChange}
          isLoading={isLoading}
        />

        <div className={styles.controlsWrapper}>
          <button
            ref={settingsButtonRef}
            onClick={toggleSettingsPanel}
            className={`${styles.iconButton} ${
              isPanelActive ? styles.active : ""
            }`}
            title="Settings"
          >
            <Settings size={20} />
          </button>

          {isPanelVisible && (
            <div style={{ pointerEvents: "auto", display: "contents" }}>
              <SettingsPanel
                ref={settingsPanelRef}
                isOpen={isPanelActiveAndVisible}
                isClosing={isPanelClosing}
                currentPrompt={prompt}
                currentModel={editingModel}
                onPromptChange={setPrompt}
                onModelChange={onEditingModelChange}
                userName={userName}
                userEmail={userEmail}
                avatarSrc={avatarSrc}
                onSave={onSave}
                onLogout={onLogout}
                isDarkMode={isDarkMode}
                onToggleTheme={onToggleTheme}
                onResetAPIKey={onResetAPIKey}
                toggleSubview={toggleSubview}
                toggleSettingsPanel={toggleSettingsPanel}
              />
            </div>
          )}
        </div>

        {platform === "windows" && <WindowsControls />}
      </div>
    </header>
  );
};
