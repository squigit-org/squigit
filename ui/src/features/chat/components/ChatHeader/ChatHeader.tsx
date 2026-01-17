/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ForwardedRef } from "react";
import {
  RotateCw,
  Plus,
  Settings,
  SquarePen,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ModelSwitcher } from "../ModelSwitcher/ModelSwitcher";
import { ChatHistory } from "../ChatHistory/ChatHistory";
import { ChatSession } from "../../types/chat.types";
import { SettingsPanel } from "../../../settings";
import styles from "./ChatHeader.module.css";

interface ChatHeaderProps {
  // Chat Header Props
  chatTitle: string;
  onReload: () => void;
  isRotating: boolean;
  currentModel: string;
  onModelChange: (model: string) => void;
  isLoading: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSessionSelect: (id: string) => void;
  onNewChat: () => void;

  // Editor/App Header Props
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
  onNewSession: () => void; // Analyzes new image

  // New Props
  hasImageLoaded: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  chatTitle,
  onReload,
  isRotating,
  currentModel,
  onModelChange,
  isLoading,
  sessions,
  activeSessionId,
  onSessionSelect,
  onNewChat,
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
}) => {
  return (
    <header className={styles.header}>
      <div className={styles.leftSection}>
        <ChatHistory
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSessionSelect={onSessionSelect}
          onNewChat={onNewChat}
        />
        <h1 className={styles.chatTitle}>{chatTitle}</h1>
      </div>

      <div className={styles.rightSection}>
        {hasImageLoaded && (
          <button
            onClick={onNewSession}
            className={styles.iconButton}
            title="Analyze another image"
          >
            <SquarePen size={20} />
          </button>
        )}

        <button
          className={styles.iconButton}
          onClick={onNewChat}
          title="New chat"
        >
          <Plus size={20} />
        </button>

        <ModelSwitcher
          currentModel={currentModel}
          onModelChange={onModelChange}
          isLoading={isLoading}
        />

        <button
          onClick={onReload}
          className={styles.iconButton}
          title="Reload chat"
          disabled={isRotating}
        >
          <RotateCw size={20} className={isRotating ? styles.rotating : ""} />
        </button>

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
      </div>
    </header>
  );
};
