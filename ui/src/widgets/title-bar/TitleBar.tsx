/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ForwardedRef, useState } from "react";
import { RotateCw, Settings as SettingsIcon } from "lucide-react";
import {
  ModelSwitcher,
  SettingsPanel,
  TrafficLights,
  WindowsControls,
  AccountSwitcher,
  Settings,
  SettingsSection,
} from ".";
import styles from "./TitleBar.module.css";
import { Profile } from "@/lib/api/tauri/commands";
import { MModelSwitcher } from "./parts/MModelSwitcher";

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
  onLogout: () => void;
  isDarkMode: boolean;
  hasImageLoaded: boolean;
  toggleChatPanel: () => void;
  isChatPanelOpen: boolean;
  activeProfile: Profile | null;
  profiles: Profile[];
  onSwitchProfile: (profileId: string) => void;
  onAddAccount: () => void;
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
  isPanelActive,
  toggleSettingsPanel,
  settingsButtonRef,
  hasImageLoaded,
  toggleChatPanel,
  isChatPanelOpen,
  activeProfile,
  profiles,
  onSwitchProfile,
  onAddAccount,
  onLogout,
}) => {
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");

  const isUnix = platform === "macos" || platform === "linux";

  const handleOpenSettings = (section: SettingsSection) => {
    setSettingsSection(section);
    setIsSettingsOpen(true);
  };

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
        <MModelSwitcher
          currentModel={currentModel}
          onModelChange={onModelChange}
          isLoading={isLoading}
          isHidden={isPanelActive}
          onOpenSettings={handleOpenSettings}
        />

        <AccountSwitcher
          activeProfile={activeProfile}
          profiles={profiles}
          onSwitchProfile={onSwitchProfile}
          onAddAccount={onAddAccount}
          onLogout={onLogout}
        />

        {hasImageLoaded && !isPanelActive && (
          <button
            onClick={onReload}
            className={styles.iconButton}
            title="Reload chat"
            disabled={isRotating || isLoading}
          >
            <RotateCw size={20} className={isRotating ? styles.rotating : ""} />
          </button>
        )}

        <SettingsPanel onOpenSettings={handleOpenSettings} />

        <Settings
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          activeSection={settingsSection}
          onSectionChange={setSettingsSection}
        />

        {/* <button
            ref={settingsButtonRef}
            onClick={toggleSettingsPanel}
            className={`${styles.iconButton} ${
              isPanelActive ? styles.active : ""
            }`}
            title="Settings"
          >
            <Settings size={20} />
          </button> */}
        {/* </div> */}

        {platform === "windows" && <WindowsControls />}
      </div>
    </header>
  );
};
