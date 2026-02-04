/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ForwardedRef } from "react";
import { TitleBar } from "@/widgets";
import {
  ChatPanel,
  ChatTab,
  ChatTabProps,
  SettingsTab,
  SettingsTabProps,
  Topic,
} from "@/features/";
import { Profile } from "@/lib/api/tauri/commands";
import styles from "./TabLayout.module.css";

export interface TabLayoutProps
  extends
    ChatTabProps,
    Omit<
      SettingsTabProps,
      | "onModelChange"
      | "onPromptChange"
      | "currentModel"
      | "autoExpandOCR"
      | "ocrEnabled"
    > {
  onPromptChange?: (prompt: string) => void;
  autoExpandOCR: boolean;
  ocrEnabled: boolean;
  ocrLanguage: string;
  downloadedOcrLanguages: string[];
  // Common props
  editingModel: string;
  forceTopic?: Topic;

  // TitleBar props
  chatTitle: string;
  onReload: () => void;
  isRotating: boolean;
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
  setPrompt: (prompt: string) => void;
  onEditingModelChange: (model: string) => void;
  onLogout: () => void;
  toggleSubview: (isActive: boolean) => void;
  onNewSession: () => void;
  hasImageLoaded: boolean;
  toggleChatPanel: () => void;
  isChatPanelOpen: boolean;
  enablePanelAnimation?: boolean;

  // ChatPanel props
  chats: any[];
  activeSessionId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onDeleteChats: (ids: string[]) => void;
  onRenameChat: (id: string, title: string) => void;
  onTogglePinChat: (id: string) => void;
  onToggleStarChat: (id: string) => void;

  // Profile props
  activeProfile: Profile | null;
  profiles: Profile[];
  onSwitchProfile: (profileId: string) => void;
  onAddAccount: () => void;
  activeProfileId: string | null;
}

export const TabLayout: React.FC<TabLayoutProps> = ({
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
  onCheckSettings,
  onReload,
  imageInputValue,
  onImageInputChange,
  onStreamComplete,

  // Settings props
  currentPrompt,
  editingModel,
  updatePreferences,
  onLogout,
  isDarkMode,
  onToggleTheme,
  autoExpandOCR,
  ocrEnabled,
  ocrLanguage,
  downloadedOcrLanguages,
  captureType,
  geminiKey,
  imgbbKey,
  onSetAPIKey,
  setPrompt,
  onEditingModelChange,
  forceTopic,

  // TitleBar props
  isRotating,
  isPanelActive,
  toggleSettingsPanel,
  isPanelVisible,
  isPanelActiveAndVisible,
  isPanelClosing,
  settingsButtonRef,
  panelRef,
  settingsPanelRef,
  toggleSubview,
  onNewSession,
  hasImageLoaded,
  toggleChatPanel,
  isChatPanelOpen,
  enablePanelAnimation = false,

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
  // Handle chat selection - toggle settings off and open chat
  const handleSelectChatWithSettings = (id: string) => {
    if (isPanelActive) {
      // Close settings if open when selecting chat
      toggleSettingsPanel();
    }
    onSelectChat(id);
  };

  // Display title: "Settings" when settings is active, otherwise chat title
  const displayTitle = isPanelActive ? "Settings" : chatTitle;

  return (
    <div className={styles.appContainer}>
      <TitleBar
        chatTitle={displayTitle}
        onReload={onReload}
        isRotating={isRotating}
        currentModel={currentModel}
        onModelChange={onModelChange}
        isLoading={isLoading}
        isPanelActive={isPanelActive}
        toggleSettingsPanel={toggleSettingsPanel}
        isPanelVisible={isPanelVisible}
        isPanelActiveAndVisible={isPanelActiveAndVisible}
        isPanelClosing={isPanelClosing}
        settingsButtonRef={settingsButtonRef}
        panelRef={panelRef}
        settingsPanelRef={settingsPanelRef}
        prompt={currentPrompt}
        editingModel={editingModel}
        setPrompt={setPrompt}
        onEditingModelChange={onEditingModelChange}
        onLogout={onLogout}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
        toggleSubview={toggleSubview}
        onNewSession={onNewSession}
        hasImageLoaded={hasImageLoaded}
        toggleChatPanel={toggleChatPanel}
        isChatPanelOpen={isChatPanelOpen}
        activeProfile={activeProfile}
        profiles={profiles}
        onSwitchProfile={onSwitchProfile}
        onAddAccount={onAddAccount}
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
            onSelectChat={handleSelectChatWithSettings}
            onNewChat={onNewSession}
            onDeleteChat={onDeleteChat}
            onDeleteChats={onDeleteChats}
            onRenameChat={onRenameChat}
            onTogglePinChat={onTogglePinChat}
            onToggleStarChat={onToggleStarChat}
          />
        </div>

        <div className={styles.contentArea}>
          <div
            style={{
              display: isPanelActive ? "block" : "none",
              height: "100%",
            }}
          >
            <SettingsTab
              currentPrompt={currentPrompt}
              currentModel={editingModel}
              onPromptChange={setPrompt}
              onModelChange={(model) => {
                onEditingModelChange(model);
              }}
              updatePreferences={updatePreferences}
              isDarkMode={isDarkMode}
              onToggleTheme={onToggleTheme}
              autoExpandOCR={autoExpandOCR}
              ocrEnabled={ocrEnabled}
              ocrLanguage={ocrLanguage}
              downloadedOcrLanguages={downloadedOcrLanguages}
              captureType={captureType}
              geminiKey={geminiKey}
              imgbbKey={imgbbKey}
              onSetAPIKey={onSetAPIKey}
              forceTopic={forceTopic}
            />
          </div>
          <div
            style={{
              display: !isPanelActive ? "block" : "none",
              height: "100%",
            }}
          >
            <ChatTab
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
              onInputChange={onInputChange}
              onCheckSettings={toggleSettingsPanel}
              onReload={onReload}
              imageInputValue={imageInputValue}
              onImageInputChange={onImageInputChange}
              ocrEnabled={ocrEnabled}
              autoExpandOCR={autoExpandOCR}
              onStreamComplete={onStreamComplete}
              activeProfileId={activeProfileId}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
