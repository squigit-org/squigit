/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ForwardedRef } from "react";
import { TitleBar } from "../../components/";
import {
  ChatPanel,
  ChatTab,
  ChatTabProps,
  SettingsTab,
  SettingsTabProps,
} from "../../features/";
import styles from "./TabLayout.module.css";

export interface TabLayoutProps extends ChatTabProps, SettingsTabProps {
  // Common props
  editingModel: string;

  // TitleBar props
  chatTitle: string;
  onReload: () => void;
  isRotating: boolean;
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

  // Settings props
  currentPrompt,
  editingModel,
  userName,
  userEmail,
  avatarSrc,
  onSave,
  onLogout,
  isDarkMode,
  onToggleTheme,
  autoExpandOCR,
  setAutoExpandOCR,
  captureType,
  setCaptureType,
  geminiKey,
  imgbbKey,
  onSetAPIKey,
  setPrompt,
  onEditingModelChange,

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
}) => {
  // Handle chat selection - toggle settings off and open chat
  const handleSelectChatWithSettings = (id: string) => {
    if (isPanelActive) {
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
        userName={userName}
        userEmail={userEmail}
        avatarSrc={avatarSrc}
        onSave={onSave}
        onLogout={onLogout}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
        toggleSubview={toggleSubview}
        onNewSession={onNewSession}
        hasImageLoaded={hasImageLoaded}
        toggleChatPanel={toggleChatPanel}
        isChatPanelOpen={isChatPanelOpen}
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
          {isPanelActive ? (
            <SettingsTab
              currentPrompt={currentPrompt}
              currentModel={editingModel}
              userName={userName}
              userEmail={userEmail}
              avatarSrc={avatarSrc}
              onPromptChange={setPrompt}
              onModelChange={(model) => {
                onEditingModelChange(model);
              }}
              onSave={onSave}
              onLogout={onLogout}
              isDarkMode={isDarkMode}
              onToggleTheme={onToggleTheme}
              autoExpandOCR={autoExpandOCR}
              setAutoExpandOCR={setAutoExpandOCR}
              captureType={captureType}
              setCaptureType={setCaptureType}
              geminiKey={geminiKey}
              imgbbKey={imgbbKey}
              onSetAPIKey={onSetAPIKey}
              isChatPanelOpen={isChatPanelOpen}
            />
          ) : (
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
            />
          )}
        </div>
      </div>
    </div>
  );
};
