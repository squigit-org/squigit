/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Dialog } from "@/widgets";
import { ShellContextMenu, TitleBar, SidePanel } from "@/shell";
import { useShell } from "@/shell";

import "katex/dist/katex.min.css";
import styles from "./AppLayout.module.css";

import { ChatLayout } from "..";

import { Welcome, Agreement, UpdateNotes } from "@/features";

export const AppLayout: React.FC = () => {
  const shell = useShell();

  if (shell.showUpdate && shell.pendingUpdate) {
    return (
      <div className="h-screen w-screen bg-neutral-950 text-neutral-100">
        <UpdateNotes
          version={shell.pendingUpdate.version}
          notes={shell.pendingUpdate.notes}
          onClose={() => {
            shell.setShowUpdate(false);
            sessionStorage.setItem("update_dismissed", "true");
          }}
        />
      </div>
    );
  }

  if (shell.isLoadingState) {
    return (
      <div className="h-screen w-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        Loading...
      </div>
    );
  }

  if (shell.isAgreementPending) {
    const getOSType = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      if (userAgent.includes("win")) return "windows";
      if (userAgent.includes("mac")) return "macos";
      return "linux";
    };

    return (
      <div className="h-screen w-screen bg-neutral-950 text-neutral-100">
        <Agreement
          osType={getOSType()}
          onNext={() => {
            shell.system.setHasAgreed(true);
            shell.system.updatePreferences({});
          }}
          onCancel={shell.handleExit}
        />
      </div>
    );
  }

  if (shell.isImageMissing) {
    return (
      <div
        className={styles.appContainer}
        onContextMenu={shell.handleContextMenu}
      >
        <TitleBar
          chatTitle={"SnapLLM"}
          onReload={() => {}}
          onNewSession={shell.handleNewSession}
          isRotating={false}
          currentPrompt={shell.system.prompt}
          currentModel={shell.system.sessionModel}
          defaultModel={shell.system.startupModel}
          onModelChange={shell.system.setSessionModel}
          onOcrModelChange={shell.system.setSessionOcrLanguage}
          isLoading={false}
          onLogout={shell.performLogout}
          isSettingsOpen={shell.system.isSettingsOpen}
          onCloseSettings={() => shell.system.setSettingsOpen(false)}
          settingsSection={shell.system.settingsSection}
          onSectionChange={shell.system.setSettingsSection}
          openSettings={shell.system.openSettings}
          updatePreferences={shell.system.updatePreferences}
          themePreference={shell.system.themePreference}
          onSetTheme={shell.system.onSetTheme}
          autoExpandOCR={shell.system.autoExpandOCR}
          ocrEnabled={shell.system.ocrEnabled}
          ocrLanguage={shell.system.sessionOcrLanguage}
          defaultOcrLanguage={shell.system.startupOcrLanguage}
          downloadedOcrLanguages={shell.system.downloadedOcrLanguages}
          captureType={shell.system.captureType}
          geminiKey={shell.system.apiKey}
          imgbbKey={shell.system.imgbbKey}
          onSetAPIKey={shell.system.handleSetAPIKey}
          hasImageLoaded={false}
          toggleSidePanel={shell.toggleSidePanel}
          isSidePanelOpen={shell.isSidePanelOpen}
          activeProfile={shell.system.activeProfile}
          profiles={shell.system.profiles}
          onSwitchProfile={shell.system.switchProfile}
          onAddAccount={shell.handleAddAccount}
          onCancelAuth={shell.system.cancelAuth}
          onDeleteProfile={shell.system.deleteProfile}
          switchingProfileId={shell.system.switchingProfileId}
        />
        <div className={styles.mainContent}>
          <div
            className={`${styles.sidePanelWrapper} ${!shell.isSidePanelOpen ? styles.hidden : ""} ${shell.enablePanelAnimation ? styles.animated : ""}`}
          >
            <SidePanel
              chats={shell.chatHistory.chats}
              activeSessionId={shell.chatHistory.activeSessionId}
              onSelectChat={shell.handleSelectChat}
              onNewChat={shell.handleNewSession}
              onDeleteChat={shell.chatHistory.handleDeleteChat}
              onDeleteChats={shell.chatHistory.handleDeleteChats}
              onRenameChat={shell.chatHistory.handleRenameChat}
              onTogglePinChat={shell.chatHistory.handleTogglePinChat}
              onToggleStarChat={shell.chatHistory.handleToggleStarChat}
            />
          </div>
          <div className={styles.contentArea}>
            <Welcome
              onImageReady={shell.handleImageReady}
              isGuest={!shell.system.activeProfile}
              onLoginRequired={() => shell.setShowLoginRequiredDialog(true)}
            />
          </div>
        </div>
        {shell.contextMenu && (
          <ShellContextMenu
            x={shell.contextMenu.x}
            y={shell.contextMenu.y}
            onClose={shell.handleCloseContextMenu}
            onCopy={shell.handleCopy}
            selectedText={shell.contextMenu.selectedText}
            hasSelection={true}
          />
        )}

        <Dialog
          isOpen={shell.showGeminiAuthDialog}
          type="GEMINI_AUTH"
          onAction={(key) => {
            if (key === "confirm") {
              shell.system.openSettings("apikeys");
            }
            shell.setShowGeminiAuthDialog(false);
          }}
        />

        <Dialog
          isOpen={shell.system.showExistingProfileDialog}
          type="EXISTING_PROFILE"
          onAction={() => shell.system.setShowExistingProfileDialog(false)}
        />

        <Dialog
          isOpen={shell.showLoginRequiredDialog}
          type="LOGIN_REQUIRED"
          onAction={(key) => {
            if (key === "confirm") {
              shell.system.addAccount();
            }
            shell.setShowLoginRequiredDialog(false);
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={shell.containerRef}
      onContextMenu={shell.handleContextMenu}
      className={styles.appContainer}
    >
      <ChatLayout
        currentPrompt={shell.system.prompt}
        messages={shell.chat.messages}
        streamingText={shell.chat.streamingText}
        isChatMode={shell.chat.isChatMode}
        isLoading={shell.chat.isLoading}
        isStreaming={shell.chat.isStreaming}
        error={shell.chat.error || shell.system.systemError}
        lastSentMessage={shell.chat.lastSentMessage}
        input={shell.input}
        onInputChange={shell.setInput}
        onOpenSettings={shell.system.openSettings}
        currentModel={shell.system.sessionModel}
        startupImage={shell.system.startupImage}
        chatTitle={shell.chatTitle}
        chatId={shell.chatHistory.activeSessionId}
        onSend={() => {
          shell.chat.handleSend(shell.input);
          shell.setInput("");
        }}
        onModelChange={shell.system.setSessionModel}
        onRetry={() => {
          if (shell.chat.messages.length === 0) {
            shell.chat.handleReload();
          } else {
            shell.chat.handleRetrySend();
          }
        }}
        onReload={shell.handleChatReload}
        onDescribeEdits={async (description) => {
          shell.chat.handleDescribeEdits(description);
        }}
        sessionLensUrl={shell.sessionLensUrl}
        setSessionLensUrl={shell.handleUpdateLensUrl}
        ocrData={shell.ocrData}
        onUpdateOCRData={shell.handleUpdateOCRData}
        imageInputValue={shell.imageInput}
        onImageInputChange={shell.setImageInput}
        onCloseSettings={() => shell.system.setSettingsOpen(false)}
        isSettingsOpen={shell.system.isSettingsOpen}
        settingsSection={shell.system.settingsSection}
        onSectionChange={shell.system.setSettingsSection}
        autoExpandOCR={shell.system.autoExpandOCR}
        ocrEnabled={shell.system.ocrEnabled}
        // TitleBar props
        activeProfile={shell.system.activeProfile}
        profiles={shell.system.profiles}
        onSwitchProfile={shell.handleSwitchProfile}
        onAddAccount={shell.handleAddAccount}
        onCancelAuth={shell.system.cancelAuth}
        onDeleteProfile={shell.system.deleteProfile}
        isRotating={shell.isRotating}
        onNewSession={shell.handleNewSession}
        toggleSidePanel={shell.toggleSidePanel}
        isSidePanelOpen={shell.isSidePanelOpen}
        enablePanelAnimation={shell.enablePanelAnimation}
        onLogout={shell.performLogout}
        updatePreferences={shell.system.updatePreferences}
        themePreference={shell.system.themePreference}
        onSetTheme={shell.system.onSetTheme}
        ocrLanguage={shell.system.sessionOcrLanguage}
        defaultOcrLanguage={shell.system.startupOcrLanguage}
        defaultModel={shell.system.startupModel}
        downloadedOcrLanguages={shell.system.downloadedOcrLanguages}
        captureType={shell.system.captureType}
        geminiKey={shell.system.apiKey}
        imgbbKey={shell.system.imgbbKey}
        onSetAPIKey={shell.system.handleSetAPIKey}
        onOcrModelChange={shell.system.setSessionOcrLanguage}
        // SidePanel props
        chats={shell.chatHistory.chats}
        activeSessionId={shell.chatHistory.activeSessionId}
        onSelectChat={shell.handleSelectChat}
        onDeleteChat={shell.handleDeleteChatWrapper}
        onDeleteChats={shell.handleDeleteChatsWrapper}
        onRenameChat={shell.chatHistory.handleRenameChat}
        onTogglePinChat={shell.chatHistory.handleTogglePinChat}
        onToggleStarChat={shell.handleToggleStarChat}
        activeProfileId={shell.system.activeProfile?.id || null}
        switchingProfileId={shell.system.switchingProfileId}
      />

      {shell.contextMenu && (
        <ShellContextMenu
          x={shell.contextMenu.x}
          y={shell.contextMenu.y}
          onClose={shell.handleCloseContextMenu}
          onCopy={shell.handleCopy}
          selectedText={shell.contextMenu.selectedText}
          hasSelection={true}
        />
      )}

      <Dialog
        isOpen={shell.showGeminiAuthDialog}
        type="GEMINI_AUTH"
        onAction={(key) => {
          if (key === "confirm") {
            shell.system.openSettings("apikeys");
          }
          shell.setShowGeminiAuthDialog(false);
        }}
      />

      <Dialog
        isOpen={shell.system.showExistingProfileDialog}
        type="EXISTING_PROFILE"
        onAction={() => shell.system.setShowExistingProfileDialog(false)}
      />

      <Dialog
        isOpen={shell.showLoginRequiredDialog}
        type="LOGIN_REQUIRED"
        onAction={(key) => {
          if (key === "confirm") {
            shell.system.addAccount();
          }
          shell.setShowLoginRequiredDialog(false);
        }}
      />
    </div>
  );
};