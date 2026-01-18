/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ForwardedRef, ReactNode } from "react";
import { TitleBar } from "../../components";
import { Welcome } from "../../features";
import { ChatSession } from "../../features/chat/types/chat.types";
import styles from "./TabLayout.module.css";

export interface TabLayoutProps {
  children?: ReactNode;

  // Image ready handler for Welcome
  onImageReady: (
    data: string | { path?: string; base64?: string; mimeType: string },
  ) => void;

  // TitleBar props
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
  onShowWelcome: () => void;

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

export const TabLayout: React.FC<TabLayoutProps> = ({
  children,
  onImageReady,
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
  onShowWelcome,
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
    <div className={styles.container}>
      <div className={styles.header}>
        <TitleBar
          chatTitle={chatTitle}
          onReload={onReload}
          isRotating={isRotating}
          currentModel={currentModel}
          onModelChange={onModelChange}
          isLoading={isLoading}
          sessions={sessions}
          openTabs={openTabs}
          activeSessionId={activeSessionId}
          onSessionSelect={onSessionSelect}
          onOpenSession={onOpenSession}
          onNewChat={onNewChat}
          onCloseSession={onCloseSession}
          onCloseOtherSessions={onCloseOtherSessions}
          onCloseSessionsToRight={onCloseSessionsToRight}
          onShowWelcome={onShowWelcome}
          isPanelActive={isPanelActive}
          toggleSettingsPanel={toggleSettingsPanel}
          isPanelVisible={isPanelVisible}
          isPanelActiveAndVisible={isPanelActiveAndVisible}
          isPanelClosing={isPanelClosing}
          settingsButtonRef={settingsButtonRef}
          panelRef={panelRef}
          settingsPanelRef={settingsPanelRef}
          prompt={prompt}
          editingModel={editingModel}
          setPrompt={setPrompt}
          onEditingModelChange={onEditingModelChange}
          userName={userName}
          userEmail={userEmail}
          avatarSrc={avatarSrc}
          onSave={onSave}
          onLogout={onLogout}
          isDarkMode={isDarkMode}
          onToggleTheme={onToggleTheme}
          onResetAPIKey={onResetAPIKey}
          toggleSubview={toggleSubview}
        />
      </div>

      <div className={styles.content}>
        {children ? children : <Welcome onImageReady={onImageReady} />}
      </div>
    </div>
  );
};
