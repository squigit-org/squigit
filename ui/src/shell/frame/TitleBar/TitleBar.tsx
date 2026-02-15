/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePlatform } from "@/hooks";
import { TrafficLights } from "../TrafficLights";
import { WindowControls } from "../WindowControls";
import { SettingsOverlay } from "@/shell/overlays";
import { useShellContext } from "@/shell/context";
import { AccountSwitcher, SettingsPanel, AuthButton } from "@/features";
import { TitleBarContextMenu } from "@/shell/menus";
import styles from "./TitleBar.module.css";

export const TitleBar: React.FC = () => {
  const shell = useShellContext();
  const { os: platform } = usePlatform();
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const isUnix = platform === "macos" || platform === "linux";

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleToggleAlwaysOnTop = async () => {
    const newState = !isAlwaysOnTop;
    setIsAlwaysOnTop(newState);
    try {
      await invoke("set_always_on_top", { state: newState });
    } catch (error) {
      console.error("Failed to toggle always on top:", error);
      // Revert on failure
      setIsAlwaysOnTop(!newState);
    }
  };

  return (
    <header
      className={styles.header}
      data-tauri-drag-region
      onContextMenu={handleContextMenu}
    >
      <h1 className={styles.chatTitle}>{shell.chatTitle}</h1>

      <div className={styles.leftSection}>
        {isUnix && <TrafficLights />}

        <div className={styles.controlsWrapper}>
          <button
            onClick={shell.toggleSidePanel}
            className={`${styles.iconButton} ${
              shell.isSidePanelOpen ? styles.active : ""
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
                fill={shell.isSidePanelOpen ? "currentColor" : "none"}
                stroke={shell.isSidePanelOpen ? "none" : "currentColor"}
              />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        </div>
      </div>

      <div className={styles.rightSection}>
        <SettingsPanel onOpenSettings={shell.system.openSettings} />
        <SettingsOverlay
          isOpen={shell.system.isSettingsOpen}
          onClose={() => shell.system.setSettingsOpen(false)}
          activeSection={shell.system.settingsSection}
          onSectionChange={shell.system.setSettingsSection}
          currentPrompt={shell.system.prompt}
          defaultModel={shell.system.startupModel}
          defaultOcrLanguage={shell.system.startupOcrLanguage}
          updatePreferences={shell.system.updatePreferences}
          themePreference={shell.system.themePreference}
          onSetTheme={shell.system.onSetTheme}
          autoExpandOCR={shell.system.autoExpandOCR}
          ocrEnabled={shell.system.ocrEnabled}
          captureType={shell.system.captureType}
          geminiKey={shell.system.apiKey}
          imgbbKey={shell.system.imgbbKey}
          onSetAPIKey={shell.system.handleSetAPIKey}
          isGuest={!shell.system.activeProfile}
        />

        {shell.system.activeProfile ? (
          <>
            <AccountSwitcher
              activeProfile={shell.system.activeProfile}
              onNewSession={shell.handleNewSession}
              profiles={shell.system.profiles}
              onSwitchProfile={shell.handleSwitchProfile}
              onAddAccount={shell.handleAddAccount}
              onLogout={shell.performLogout}
              onDeleteProfile={shell.system.deleteProfile}
              switchingProfileId={shell.system.switchingProfileId}
            />
          </>
        ) : (
          <AuthButton
            onLogin={shell.handleAddAccount}
            onCancel={shell.system.cancelAuth}
            isLoading={shell.system.switchingProfileId === "creating_account"}
            disabled={shell.isAgreementPending && !shell.agreedToTerms}
            disabledTitle="Please read and agree to the instructions first"
          />
        )}

        {platform === "windows" && <WindowControls />}
      </div>

      {contextMenu && (
        <TitleBarContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onNewChat={shell.handleNewSession}
          onOpenSettings={() => shell.system.openSettings("general")}
          isAlwaysOnTop={isAlwaysOnTop}
          onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
        />
      )}
    </header>
  );
};
