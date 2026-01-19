/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ReactNode } from "react";
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
  onNewChat: () => void;
  onCloseSession: (id: string) => boolean;
  onCloseOtherSessions: (keepId: string) => void;
  onCloseSessionsToRight: (fromId: string) => void;
  onShowWelcome: () => void;
  onOpenSettingsTab: () => void;
  onBeforeCloseSession?: (id: string) => boolean;

  // Side panel props
  isSidePanelOpen: boolean;
  onToggleSidePanel: () => void;
  onReorderTabs?: (fromIndex: number, toIndex: number) => void;
  sidePanel?: ReactNode;
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
  onNewChat,
  onCloseSession,
  onCloseOtherSessions,
  onCloseSessionsToRight,
  onShowWelcome,
  onOpenSettingsTab,
  onBeforeCloseSession,
  isSidePanelOpen,
  onToggleSidePanel,
  onReorderTabs,
  sidePanel,
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
          onNewChat={onNewChat}
          onCloseSession={onCloseSession}
          onCloseOtherSessions={onCloseOtherSessions}
          onCloseSessionsToRight={onCloseSessionsToRight}
          onShowWelcome={onShowWelcome}
          onOpenSettingsTab={onOpenSettingsTab}
          onBeforeCloseSession={onBeforeCloseSession}
          isSidePanelOpen={isSidePanelOpen}
          onToggleSidePanel={onToggleSidePanel}
          onReorderTabs={onReorderTabs}
        />
      </div>

      <div className={styles.content}>
        <div
          className={`${styles.sidePanelWrapper} ${isSidePanelOpen ? styles.sidePanelOpen : ""}`}
        >
          {sidePanel}
        </div>
        {children ? children : <Welcome onImageReady={onImageReady} />}
      </div>
    </div>
  );
};
