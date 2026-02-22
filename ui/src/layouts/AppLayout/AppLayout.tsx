/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog } from "@/primitives";
import { ShellProvider, useShellContext } from "@/shell/context";
import { Welcome, Agreement, UpdateNotes } from "@/features";
import { ShellContextMenu, TitleBar, SidePanel, AppShell } from "@/shell";

import "katex/dist/katex.min.css";
import styles from "./AppLayout.module.css";

const isOnboardingId = (id: string) => id.startsWith("__system_");

const AppLayoutContent: React.FC = () => {
  const shell = useShellContext();

  React.useEffect(() => {
    if (!shell.isLoadingState) {
      invoke("show_window");
    }
  }, [shell.isLoadingState]);

  if (shell.isLoadingState) {
    return (
      <div className="h-screen w-screen bg-neutral-950 flex items-center justify-center text-neutral-400">
        Loading...
      </div>
    );
  }

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

    if (shell.isImageMissing) {
      return (
        <Welcome
          onImageReady={shell.handleImageReady}
          isGuest={!shell.system.activeProfile}
          onLoginRequired={() => shell.setShowLoginRequiredDialog(true)}
        />
      );
    }

    return <AppShell />;
  };

  if (shell.isImageMissing) {
    return (
      <div
        className={styles.appContainer}
        onContextMenu={shell.handleContextMenu}
      >
        <TitleBar />
        <div className={styles.mainContent}>
          <div
            className={`${styles.sidePanelWrapper} ${!shell.isSidePanelOpen ? styles.hidden : ""} ${shell.enablePanelAnimation ? styles.animated : ""}`}
          >
            <SidePanel />
          </div>
          <div className={styles.contentArea}>{renderContent()}</div>
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
            } else {
              shell.chat.appendErrorMessage(
                "Please configure your Gemini API key to continue.",
              );
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

        <Dialog
          isOpen={shell.showCaptureDeniedDialog}
          type="CAPTURE_PERMISSION_DENIED"
          onAction={() => shell.setShowCaptureDeniedDialog(false)}
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
      <TitleBar />
      <div className={styles.mainContent}>
        <div
          className={`${styles.sidePanelWrapper} ${
            !shell.isSidePanelOpen ? styles.hidden : ""
          } ${shell.enablePanelAnimation ? styles.animated : ""}`}
        >
          <SidePanel />
        </div>
        <div className={styles.contentArea}>{renderContent()}</div>
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
          } else {
            shell.chat.appendErrorMessage(
              "Please configure your Gemini API key to continue.",
            );
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

      <Dialog
        isOpen={shell.showCaptureDeniedDialog}
        type="CAPTURE_PERMISSION_DENIED"
        onAction={() => shell.setShowCaptureDeniedDialog(false)}
      />
    </div>
  );
};

export const AppLayout: React.FC = () => {
  return (
    <ShellProvider>
      <AppLayoutContent />
    </ShellProvider>
  );
};
