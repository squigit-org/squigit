/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ForwardedRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { TrafficLights, WindowsControls } from ".";
import styles from "./TitleBar.module.css";
import { Profile } from "@/lib/api/tauri/commands";
import {
  AccountSwitcher,
  ModelSwitcher,
  SettingsPanel,
  SettingsSection,
  SettingsShell,
  AuthButton,
} from "@/features";
import { UserPreferences } from "@/lib/storage/app-settings";

type Platform = "macos" | "linux" | "windows";

interface TitleBarProps {
  chatTitle: string;
  onReload: () => void;
  isRotating: boolean;
  currentPrompt: string;
  currentModel: string;
  onModelChange: (model: string) => void;
  isLoading: boolean;
  onLogout: () => void;
  isSettingsOpen: boolean;
  onCloseSettings: () => void;
  settingsSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  openSettings: (section: SettingsSection) => void;
  hasImageLoaded: boolean;
  toggleChatPanel: () => void;
  isChatPanelOpen: boolean;
  activeProfile: Profile | null;
  profiles: Profile[];
  onSwitchProfile: (profileId: string) => void;
  onNewSession: () => void;
  onAddAccount: () => void;
  onCancelAuth: () => void;
  onDeleteProfile: (profileId: string) => void;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  themePreference: "dark" | "light" | "system";
  onSetTheme: (theme: "dark" | "light" | "system") => void;
  autoExpandOCR: boolean;
  ocrEnabled: boolean;
  ocrLanguage: string;
  defaultOcrLanguage: string;
  defaultModel: string;
  downloadedOcrLanguages: string[];
  captureType: "rectangular" | "squiggle";
  geminiKey: string;
  imgbbKey: string;
  onSetAPIKey: (
    provider: "google ai studio" | "imgbb",
    key: string,
  ) => Promise<boolean>;
  onOcrModelChange: (model: string) => void;
  switchingProfileId?: string | null;
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
  onNewSession,
  isRotating,
  currentPrompt,
  currentModel,
  onModelChange,
  isLoading,
  onLogout,
  isSettingsOpen,
  onCloseSettings,
  settingsSection,
  onSectionChange,
  openSettings,
  hasImageLoaded,
  toggleChatPanel,
  isChatPanelOpen,
  activeProfile,
  profiles,
  onSwitchProfile,
  onAddAccount,
  onCancelAuth,
  onDeleteProfile,
  updatePreferences,
  themePreference,
  onSetTheme,
  autoExpandOCR,
  ocrEnabled,
  ocrLanguage,
  defaultOcrLanguage,
  defaultModel,
  downloadedOcrLanguages,
  captureType,
  geminiKey,
  imgbbKey,
  onSetAPIKey,
  onOcrModelChange,
  switchingProfileId,
}) => {
  const [platform] = useState<Platform>(() => detectPlatform());

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
        {activeProfile ? (
          <>
            <ModelSwitcher
              currentModel={currentModel}
              onModelChange={onModelChange}
              isLoading={isLoading}
              onOpenSettings={openSettings}
              ocrEnabled={ocrEnabled}
              downloadedOcrLanguages={downloadedOcrLanguages}
              currentOcrModel={ocrLanguage}
              onOcrModelChange={onOcrModelChange}
            />

            <AccountSwitcher
              activeProfile={activeProfile}
              onNewSession={onNewSession}
              profiles={profiles}
              onSwitchProfile={onSwitchProfile}
              onAddAccount={onAddAccount}
              onLogout={onLogout}
              onDeleteProfile={onDeleteProfile}
              switchingProfileId={switchingProfileId}
            />
          </>
        ) : (
          <AuthButton
            onLogin={onAddAccount}
            onCancel={onCancelAuth}
            isLoading={switchingProfileId === "creating_account"}
          />
        )}

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

        <SettingsPanel onOpenSettings={openSettings} />

        <SettingsShell
          isOpen={isSettingsOpen}
          onClose={onCloseSettings}
          activeSection={settingsSection}
          onSectionChange={onSectionChange}
          currentPrompt={currentPrompt}
          defaultModel={defaultModel}
          defaultOcrLanguage={defaultOcrLanguage}
          updatePreferences={updatePreferences}
          themePreference={themePreference}
          onSetTheme={onSetTheme}
          autoExpandOCR={autoExpandOCR}
          ocrEnabled={ocrEnabled}
          downloadedOcrLanguages={downloadedOcrLanguages}
          captureType={captureType}
          geminiKey={geminiKey}
          imgbbKey={imgbbKey}
          onSetAPIKey={onSetAPIKey}
          isGuest={!activeProfile}
        />

        {platform === "windows" && <WindowsControls />}
      </div>
    </header>
  );
};
