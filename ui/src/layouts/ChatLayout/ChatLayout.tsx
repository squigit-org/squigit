/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { ForwardedRef } from "react";
import { TitleBar } from "@/widgets";
import { ChatPanel, ChatTab, ChatTabProps } from "@/features/";
import { Profile } from "@/lib/api/tauri/commands";
import styles from "./ChatLayout.module.css";

export interface ChatLayoutProps extends ChatTabProps {
  // TitleBar props
  chatTitle: string;
  onReload: () => void;
  isRotating: boolean;
  isLoading: boolean;
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

export const ChatLayout: React.FC<ChatLayoutProps> = ({
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

  // TitleBar props
  isRotating,
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
  return (
    <div className={styles.appContainer}>
      <TitleBar
        chatTitle={chatTitle}
        onReload={onReload}
        isRotating={isRotating}
        currentModel={currentModel}
        onModelChange={onModelChange}
        isLoading={isLoading}
        hasImageLoaded={hasImageLoaded}
        toggleChatPanel={toggleChatPanel}
        isChatPanelOpen={isChatPanelOpen}
        activeProfile={activeProfile}
        profiles={profiles}
        onSwitchProfile={onSwitchProfile}
        onAddAccount={onAddAccount}
        onLogout={function (): void {
          throw new Error("Function not implemented.");
        }}
        isDarkMode={false}
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
          <div
            style={{
              display: "none",
              height: "100%",
            }}
          ></div>
          <div
            style={{
              display: "none",
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
              onReload={onReload}
              imageInputValue={imageInputValue}
              onImageInputChange={onImageInputChange}
              onStreamComplete={onStreamComplete}
              activeProfileId={activeProfileId}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
