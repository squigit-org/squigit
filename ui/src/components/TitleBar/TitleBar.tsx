/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { RotateCw, Settings, PanelLeft } from "lucide-react";
import { ModelSwitcher } from "../../features/chat/components/ModelSwitcher/ModelSwitcher";
import { ChatSession } from "../../features/chat/types/chat.types";
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
  onNewChat: () => void;
  onCloseSession: (id: string) => boolean;
  onCloseOtherSessions: (keepId: string) => void;
  onCloseSessionsToRight: (fromId: string) => void;
  onShowWelcome: () => void;
  onOpenSettingsTab: () => void;
  isSidePanelOpen: boolean;
  onToggleSidePanel: () => void;
  onReorderTabs?: (fromIndex: number, toIndex: number) => void;
}

const detectPlatform = (): Platform => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  if (userAgent.includes("mac os")) return "macos";
  if (userAgent.includes("windows")) return "windows";
  return "linux";
};

export const TitleBar: React.FC<TitleBarProps> = ({
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
  isSidePanelOpen,
  onToggleSidePanel,
  onReorderTabs,
}) => {
  const [platform] = useState<Platform>(() => detectPlatform());

  const isUnix = platform === "macos" || platform === "linux";

  // Check if active tab is a chat tab
  const activeTab = openTabs.find((t) => t.id === activeSessionId);
  const isActiveChatTab = activeTab && activeTab.type !== "settings";
  // Check if Settings tab is open
  const isSettingsOpen = openTabs.some((t) => t.type === "settings");

  return (
    <header className={styles.header} data-tauri-drag-region>
      <div className={styles.leftSection}>
        {isUnix && <TrafficLights />}

        {/* Side panel toggle button */}
        <button
          onClick={onToggleSidePanel}
          className={`${styles.iconButton} ${isSidePanelOpen ? styles.active : ""}`}
          title={isSidePanelOpen ? "Close sidebar" : "Open sidebar"}
        >
          <PanelLeft size={20} />
        </button>

        <TabBar
          sessions={sessions}
          openTabs={openTabs}
          activeSessionId={activeSessionId}
          onSessionSelect={onSessionSelect}
          onCloseSession={onCloseSession}
          onCloseOtherSessions={onCloseOtherSessions}
          onCloseSessionsToRight={onCloseSessionsToRight}
          onShowWelcome={onShowWelcome}
          onReorderTabs={onReorderTabs}
        />
      </div>

      <div className={styles.rightSection}>
        {/* Only show reload and model switcher when active tab is a chat */}
        {isActiveChatTab && (
          <>
            <button
              onClick={onReload}
              className={styles.iconButton}
              title="Reload chat"
              disabled={isRotating}
            >
              <RotateCw
                size={20}
                className={isRotating ? styles.rotating : ""}
              />
            </button>

            <ModelSwitcher
              currentModel={currentModel}
              onModelChange={onModelChange}
              isLoading={isLoading}
            />
          </>
        )}

        <button
          onClick={onOpenSettingsTab}
          className={`${styles.iconButton} ${isSettingsOpen ? styles.active : ""}`}
          title="Settings"
        >
          <Settings size={20} />
        </button>

        {platform === "windows" && <WindowsControls />}
      </div>
    </header>
  );
};
