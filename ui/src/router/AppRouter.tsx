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
import { AppProvider, useAppContext } from "@/providers/AppProvider";
import { AppContextMenu, TitleBar, SidePanel } from "@/layout";
import { Chat } from "@/features/chat";

import "katex/dist/katex.min.css";
import styles from "./AppRouter.module.css";
import { AppLogo } from "@/assets";

const isOnboardingId = (id: string) => id.startsWith("__system_");

const AppRouterContent: React.FC = () => {
  const app = useAppContext();

  const isAgreed = app.system.hasAgreed || app.agreedToTerms;
  const baseLoginDialog = getDialogs(app.system.appName).LOGIN_REQUIRED;
  const loginRequiredDialog = {
    ...baseLoginDialog,
    actions: baseLoginDialog.actions.map((action) => ({
      ...action,
      disabled: action.actionKey === "confirm" ? !isAgreed : action.disabled,
    })),
  };

  React.useEffect(() => {
    if (!app.isLoadingState) {
      invoke("show_window");
    }
  }, [app.isLoadingState]);

  const renderContent = () => {
    const activeId = app.chatHistory.activeSessionId;

    if (activeId && isOnboardingId(activeId)) {
      if (activeId === "__system_welcome") {
        return <Agreement />;
      }
      if (activeId.startsWith("__system_update")) {
        return <UpdateNotes />;
      }
    }

    if (app.isLoadingState) {
      return <AppLogo size={40} />;
    }

    if (app.isImageMissing) {
      return (
        <Welcome
          onImageReady={app.handleImageReady}
          isGuest={!app.system.activeProfile}
          onLoginRequired={() => app.setShowLoginRequiredDialog(true)}
        />
      );
    }

    return <Chat />;
  };

  const titleBar = (
    <>
      <TitleBar />
      <div className={styles.mainContent}>
        {!app.isLoadingState && (
          <div
            className={`
            ${styles.sidePanelWrapper}
            ${!app.isSidePanelOpen ? styles.hidden : ""}
            ${app.enablePanelAnimation ? styles.animated : ""}`}
          >
            <SidePanel />
          </div>
        )}
        <div
          className={
            app.isLoadingState
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
      {app.contextMenu && (
        <AppContextMenu
          x={app.contextMenu.x}
          y={app.contextMenu.y}
          onClose={app.handleCloseContextMenu}
          onCopy={app.handleCopy}
          selectedText={app.contextMenu.selectedText}
          hasSelection={true}
        />
      )}

      <Dialog
        isOpen={app.showGeminiAuthDialog}
        type="GEMINI_AUTH"
        onAction={(key) => {
          let msg = "";
          if (key === "confirm") {
            app.system.openSettings("apikeys");
          } else {
            msg = "Please configure your Gemini API key to continue.";
          }
          app.chat.appendErrorMessage(msg);
          app.setShowGeminiAuthDialog(false);
        }}
      />

      <Dialog
        isOpen={app.system.showExistingProfileDialog}
        type="EXISTING_PROFILE"
        onAction={() => app.system.setShowExistingProfileDialog(false)}
      />

      <Dialog
        isOpen={app.showLoginRequiredDialog}
        type={loginRequiredDialog}
        onAction={(key) => {
          if (key === "confirm") {
            app.system.addAccount();
          }
          app.setShowLoginRequiredDialog(false);
        }}
      />

      <Dialog
        isOpen={app.showCaptureDeniedDialog}
        type="CAPTURE_PERMISSION_DENIED"
        onAction={() => app.setShowCaptureDeniedDialog(false)}
      />
    </>
  );

  if (app.isLoadingState) {
    return (
      <div
        className={styles.appContainer}
        onContextMenu={app.handleContextMenu}
      >
        {titleBar}
      </div>
    );
  }

  if (app.isImageMissing) {
    return (
      <div
        className={styles.appContainer}
        onContextMenu={app.handleContextMenu}
      >
        {titleBar}
        {appDialogs}
      </div>
    );
  }

  return (
    <div
      ref={app.containerRef}
      onContextMenu={app.handleContextMenu}
      className={styles.appContainer}
    >
      {titleBar}
      {appDialogs}
    </div>
  );
};

export const AppRouter: React.FC = () => {
  return (
    <AppProvider>
      <AppRouterContent />
    </AppProvider>
  );
};
