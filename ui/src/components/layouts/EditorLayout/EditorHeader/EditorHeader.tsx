/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ForwardedRef } from "react";
import { Settings } from "lucide-react";
import { SettingsPanel } from "../../../../features/settings";
import styles from "./EditorHeader.module.css";

interface EditorHeaderProps {
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
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({
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
}) => {
  return (
    <header className={styles.header}>
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
    </header>
  );
};
