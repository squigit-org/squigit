/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ForwardedRef } from "react";
import { TitleBar } from "@/widgets";
import {
  ChatPanel,
  ChatShell,
  ChatShellProps,
  SettingsSection,
} from "@/features";

import { Profile } from "@/lib/api/tauri/commands";
import styles from "./ChatLayout.module.css";

import { UserPreferences } from "@/lib/config/preferences";

export interface ChatLayoutProps extends ChatShellProps {
  currentPrompt: string;
  // TitleBar props
  chatTitle: string;
  onReload: () => void;
  isRotating: boolean;
  isLoading: boolean;
  onNewSession: () => void;
  toggleChatPanel: () => void;
  isChatPanelOpen: boolean;
  enablePanelAnimation?: boolean;
  onLogout: () => void;
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
    provider: "google ai studio" | "imgbb" | "gemini",
    key: string,
  ) => Promise<boolean>;
  onOcrModelChange: (model: string) => void;
  onCloseSettings: () => void;
  isSettingsOpen: boolean;
  settingsSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;

  // Profile props
  activeProfile: Profile | null;
  profiles: Profile[];
  onSwitchProfile: (profileId: string) => void;
  onAddAccount: () => void;
  activeProfileId: string | null;

  // ChatPanel props
  chats: any[];
  activeSessionId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onDeleteChats: (ids: string[]) => void;
  onRenameChat: (id: string, title: string) => void;
  onTogglePinChat: (id: string) => void;
  onToggleStarChat: (id: string) => void;
}

export const ChatLayout: React.FC<ChatLayoutProps> = ({
  currentPrompt,
  // Chat props
  messages,
  streamingText,
  isChatMode,
  isLoading,
  isStreaming,
  error,
  lastSentMessage,
  input,
  currentModel,
  startupImage,
  chatTitle,
  chatId,
  sessionLensUrl,
  setSessionLensUrl,
  onDescribeEdits,
  ocrData,
  onUpdateOCRData,
  onSend,
  onModelChange,
  onRetry,
  onInputChange,
  onReload,
  imageInputValue,
  onImageInputChange,
  onStreamComplete,
  onOpenSettings,
  onCloseSettings,
  isSettingsOpen,
  settingsSection,
  onSectionChange,
  autoExpandOCR,
  ocrEnabled,

  // TitleBar props
  isRotating,
  onNewSession,
  toggleChatPanel,
  isChatPanelOpen,
  enablePanelAnimation = false,
  onLogout,
  updatePreferences,
  themePreference,
  onSetTheme,
  ocrLanguage,
  defaultOcrLanguage,
  defaultModel,
  downloadedOcrLanguages,
  captureType,
  geminiKey,
  imgbbKey,
  onSetAPIKey,
  onOcrModelChange,

  // ChatPanel props
  chats,
  activeSessionId,
  onSelectChat,
  onDeleteChat,
  onDeleteChats,
  onRenameChat,
  onTogglePinChat,
  onToggleStarChat,
  activeProfile,
  profiles,
  onSwitchProfile,
  onAddAccount,
  activeProfileId,
}) => {
  return (
    <div className={styles.appContainer}>
      <TitleBar
        chatTitle={chatTitle}
        onReload={onReload}
        isRotating={isRotating}
        currentPrompt={currentPrompt}
        currentModel={currentModel}
        onModelChange={onModelChange}
        isLoading={isLoading}
        hasImageLoaded={!!startupImage} // TitleBar needs hasImageLoaded
        toggleChatPanel={toggleChatPanel}
        isChatPanelOpen={isChatPanelOpen}
        activeProfile={activeProfile}
        profiles={profiles}
        onSwitchProfile={onSwitchProfile}
        onAddAccount={onAddAccount}
        onLogout={onLogout}
        updatePreferences={updatePreferences}
        themePreference={themePreference}
        onSetTheme={onSetTheme}
        autoExpandOCR={autoExpandOCR}
        ocrEnabled={ocrEnabled}
        ocrLanguage={ocrLanguage}
        defaultOcrLanguage={defaultOcrLanguage}
        defaultModel={defaultModel}
        downloadedOcrLanguages={downloadedOcrLanguages}
        captureType={captureType}
        geminiKey={geminiKey}
        imgbbKey={imgbbKey}
        onSetAPIKey={onSetAPIKey}
        onOcrModelChange={onOcrModelChange}
        isSettingsOpen={isSettingsOpen}
        onCloseSettings={onCloseSettings}
        settingsSection={settingsSection}
        onSectionChange={onSectionChange}
        openSettings={onOpenSettings}
      />

      <div className={styles.mainContent}>
        <div
          className={`${styles.chatPanelWrapper} ${
            !isChatPanelOpen ? styles.hidden : ""
          } ${enablePanelAnimation ? styles.animated : ""}`}
        >
          <ChatPanel
            chats={chats}
            activeSessionId={activeSessionId}
            onSelectChat={onSelectChat}
            onNewChat={onNewSession}
            onDeleteChat={onDeleteChat}
            onDeleteChats={onDeleteChats}
            onRenameChat={onRenameChat}
            onTogglePinChat={onTogglePinChat}
            onToggleStarChat={onToggleStarChat}
          />
        </div>

        <div className={styles.contentArea}>
          <ChatShell
            messages={messages}
            streamingText={streamingText}
            isChatMode={isChatMode}
            isLoading={isLoading}
            isStreaming={isStreaming}
            error={error}
            lastSentMessage={lastSentMessage}
            input={input}
            currentModel={currentModel}
            startupImage={startupImage}
            chatTitle={chatTitle}
            chatId={chatId}
            sessionLensUrl={sessionLensUrl}
            setSessionLensUrl={setSessionLensUrl}
            onDescribeEdits={onDescribeEdits}
            ocrData={ocrData}
            onUpdateOCRData={onUpdateOCRData}
            onSend={onSend}
            onModelChange={onModelChange}
            onRetry={onRetry}
            onOpenSettings={onOpenSettings}
            onInputChange={onInputChange}
            onReload={onReload}
            autoExpandOCR={autoExpandOCR}
            ocrEnabled={ocrEnabled}
            imageInputValue={imageInputValue}
            onImageInputChange={onImageInputChange}
            onStreamComplete={onStreamComplete}
            activeProfileId={activeProfileId}
          />
        </div>
      </div>
    </div>
  );
};
