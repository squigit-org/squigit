/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Dialog } from "@/primitives";
import { ShellContextMenu, TitleBar, SidePanel } from "@/shell";
import { ShellProvider, useShellContext } from "@/shell/context";
import { usePlatform } from "@/hooks";

import "katex/dist/katex.min.css";
import styles from "./AppLayout.module.css";

import { ChatLayout } from "..";

import { Welcome, Agreement, UpdateNotes } from "@/features";

const AppLayoutContent: React.FC = () => {
  const shell = useShellContext();

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

  const { os } = usePlatform();

  if (shell.isAgreementPending) {
    return (
      <div className="h-screen w-screen bg-neutral-950 text-neutral-100">
        <Agreement
          osType={os}
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
        <TitleBar />
        <div className={styles.mainContent}>
          <div
            className={`${styles.sidePanelWrapper} ${!shell.isSidePanelOpen ? styles.hidden : ""} ${shell.enablePanelAnimation ? styles.animated : ""}`}
          >
            <SidePanel />
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
      <ChatLayout />

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

export const AppLayout: React.FC = () => {
  return (
    <ShellProvider>
      <AppLayoutContent />
    </ShellProvider>
  );
};
