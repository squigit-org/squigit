/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { getDialogs } from "@/lib";
import { Dialog } from "@/components";
import { Welcome, Agreement, UpdateNotes } from "@/features";
import { ShellProvider, useShellContext } from "@/providers/ShellProvider";
import { ShellContextMenu, TitleBar, SidePanel } from "@/layout";
import { Chat } from "@/features/chat";

import "katex/dist/katex.min.css";
import styles from "./AppRouter.module.css";
import { AppLogo } from "@/assets";

const isOnboardingId = (id: string) => id.startsWith("__system_");

const AppRouterContent: React.FC = () => {
  const shell = useShellContext();

  const isAgreed = shell.system.hasAgreed || shell.agreedToTerms;
  const baseLoginDialog = getDialogs(shell.system.appName).LOGIN_REQUIRED;
  const loginRequiredDialog = {
    ...baseLoginDialog,
    actions: baseLoginDialog.actions.map((action) => ({
      ...action,
      disabled: action.actionKey === "confirm" ? !isAgreed : action.disabled,
    })),
  };

  React.useEffect(() => {
    if (!shell.isLoadingState) {
      invoke("show_window");
    }
  }, [shell.isLoadingState]);

  const renderContent = () => {
    const activeId = shell.chatHistory.activeSessionId;

    if (activeId && isOnboardingId(activeId)) {
      if (activeId === "__system_welcome") {
        return <Agreement />;
      }
      if (activeId.startsWith("__system_update")) {
        return <UpdateNotes />;
      }
    }

    if (shell.isLoadingState) {
      return <AppLogo size={40} />;
    }

    if (shell.isImageMissing) {
      return (
        <Welcome
          onImageReady={shell.handleImageReady}
          isGuest={!shell.system.activeProfile}
          onLoginRequired={() => shell.setShowLoginRequiredDialog(true)}
        />
      );
    }

    return <Chat />;
  };

  const titleBar = (
    <>
      <TitleBar />
      <div className={styles.mainContent}>
        {!shell.isLoadingState && (
          <div
            className={`
            ${styles.sidePanelWrapper}
            ${!shell.isSidePanelOpen ? styles.hidden : ""}
            ${shell.enablePanelAnimation ? styles.animated : ""}`}
          >
            <SidePanel />
          </div>
        )}
        <div
          className={
            shell.isLoadingState
              ? "h-screen w-screen bg-neutral-950 flex items-center justify-center"
              : styles.contentArea
          }
        >
          {renderContent()}
        </div>
      </div>
    </>
  );

  const appDialogs = (
    <>
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
          let msg = "";
          if (key === "confirm") {
            shell.system.openSettings("apikeys");
          } else {
            msg = "Please configure your Gemini API key to continue.";
          }
          shell.chat.appendErrorMessage(msg);
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
        type={loginRequiredDialog}
        onAction={(key) => {
          if (key === "confirm") {
            shell.system.addAccount();
          }
          shell.setShowLoginRequiredDialog(false);
        }}
      />

      <Dialog
        isOpen={shell.showCaptureDeniedDialog}
        type="CAPTURE_PERMISSION_DENIED"
        onAction={() => shell.setShowCaptureDeniedDialog(false)}
      />
    </>
  );

  if (shell.isLoadingState) {
    return (
      <div
        className={styles.appContainer}
        onContextMenu={shell.handleContextMenu}
      >
        {titleBar}
      </div>
    );
  }

  if (shell.isImageMissing) {
    return (
      <div
        className={styles.appContainer}
        onContextMenu={shell.handleContextMenu}
      >
        {titleBar}
        {appDialogs}
      </div>
    );
  }

  return (
    <div
      ref={shell.containerRef}
      onContextMenu={shell.handleContextMenu}
      className={styles.appContainer}
    >
      {titleBar}
      {appDialogs}
    </div>
  );
};

export const AppRouter: React.FC = () => {
  return (
    <ShellProvider>
      <AppRouterContent />
    </ShellProvider>
  );
};
