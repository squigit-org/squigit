/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ForwardedRef } from "react";
import { Settings, RotateCw } from "lucide-react";
import { SettingsPanel } from "../../../settings";
import { ModelSelector } from "./ModelSelector";
import styles from "./ChatHeader.module.css";

interface ChatHeaderProps {
  isPanelActive: boolean;
  toggleSettingsPanel: () => void;
  onReload: () => void;
  isRotating: boolean;
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
  currentModel: string;
  onModelChange: (model: string) => void;
  isLoading: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  isPanelActive,
  toggleSettingsPanel,
  onReload,
  isRotating,
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
  currentModel,
  onModelChange,
  isLoading,
}) => {
  return (
    <header className={styles.header}>
      <div className={styles.leftSection}>
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

          <button
            onClick={onReload}
            className={styles.iconButton}
            title="Reload chat"
            disabled={isRotating}
          >
            <RotateCw size={20} className={isRotating ? styles.rotating : ""} />
          </button>

          {isPanelVisible && (
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
          )}
        </div>

        <div>
          <ModelSelector
            currentModel={currentModel}
            onModelChange={onModelChange}
            isLoading={isLoading}
          />
        </div>
      </div>
    </header>
  );
};
