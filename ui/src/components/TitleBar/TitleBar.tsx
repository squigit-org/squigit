/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ForwardedRef, useState } from "react";
import { RotateCw, Settings, SquarePen } from "lucide-react";
import { ModelSwitcher } from "../../features/chat/components/ModelSwitcher/ModelSwitcher";
import { ChatHistory } from "../../features/chat/components/ChatHistory/ChatHistory";
import { ChatSession } from "../../features/chat/types/chat.types";
import { SettingsPanel } from "../../features/settings";
import styles from "./TitleBar.module.css";
import { TrafficLights, WindowsControls } from "./WindowControls";
import { TabBar } from "./TabBar";

type Platform = "macos" | "linux" | "windows";

interface TitleBarProps {
  chatTitle: string;
  onReload: () => void;
  isRotating: boolean;
  currentModel: string;
  onModelChange: (model: string) => void;
  isLoading: boolean;
  sessions: ChatSession[];
  openTabs: ChatSession[];
  activeSessionId: string | null;
  onSessionSelect: (id: string) => void;
  onOpenSession: (id: string) => void;
  onNewChat: () => void;
  onCloseSession: (id: string) => boolean;
  onCloseOtherSessions: (keepId: string) => void;
  onCloseSessionsToRight: (fromId: string) => void;

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
}

const detectPlatform = (): Platform => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  console.log("TitleBar Platform Detection - UA:", userAgent);
  if (userAgent.includes("mac os")) return "macos";
  if (userAgent.includes("windows")) return "windows";
  return "linux";
};

export const TitleBar: React.FC<TitleBarProps> = ({
  chatTitle,
  onReload,
  isRotating,
  currentModel,
  onModelChange,
  isLoading,
  sessions,
  openTabs,
  activeSessionId,
  onSessionSelect,
  onOpenSession,
  onNewChat,
  onCloseSession,
  onCloseOtherSessions,
  onCloseSessionsToRight,
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
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform());

  const isUnix = platform === "macos" || platform === "linux";

  return (
    <header className={styles.header} data-tauri-drag-region>
      <div className={styles.leftSection}>
        {isUnix && <TrafficLights />}

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

        <ChatHistory
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSessionSelect={onSessionSelect}
          onNewChat={onNewChat}
        />

        <TabBar
          sessions={sessions}
          openTabs={openTabs}
          activeSessionId={activeSessionId}
          onSessionSelect={onSessionSelect}
          onNewChat={onNewChat}
          onCloseSession={onCloseSession}
          onCloseOtherSessions={onCloseOtherSessions}
          onCloseSessionsToRight={onCloseSessionsToRight}
          onNewSession={onNewSession}
        />
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
          onClick={onReload}
          className={styles.iconButton}
          title="Reload chat"
          disabled={isRotating}
        >
          <RotateCw size={20} className={isRotating ? styles.rotating : ""} />
        </button>

        <ModelSwitcher
          currentModel={currentModel}
          onModelChange={onModelChange}
          isLoading={isLoading}
        />

        {platform === "windows" && <WindowsControls />}
      </div>
    </header>
  );
};
