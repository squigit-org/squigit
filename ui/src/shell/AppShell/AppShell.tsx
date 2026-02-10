/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Dialog } from "@/primitives";
import { ImageShell, ChatShell } from "@/shell";
import { parseGeminiError } from "@/lib/helpers/errorParser";
import { useShellContext } from "@/shell/context";
import styles from "./AppShell.module.css";

const AppShellComponent: React.FC = () => {
  const shell = useShellContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isErrorDismissed, setIsErrorDismissed] = useState(false);

  const error = shell.chat.error || shell.system.systemError;

  useEffect(() => {
    setIsErrorDismissed(false);
  }, [error]);

  const [isImageExpanded, setIsImageExpanded] = useState(false);

  useEffect(() => {
    setIsImageExpanded(false);
  }, [shell.chatHistory.activeSessionId]);

  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 5) return;

      if (e.deltaY < 0) {
        if (!isImageExpanded) {
          setIsImageExpanded(true);
          e.preventDefault();
        }
      } else {
        if (isImageExpanded) {
          setIsImageExpanded(false);
          e.preventDefault();
        }
      }
    };

    header.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      header.removeEventListener("wheel", handleWheel);
    };
  }, [isImageExpanded]);

  const renderError = () => {
    if (!error) return null;

    const parsedError = parseGeminiError(error);

    const getActions = () => {
      const actions: any[] = [];

      if (parsedError.actionType !== "DISMISS_ONLY") {
        actions.push({
          label: "Retry",
          onClick: () => {
            if (shell.chat.messages.length === 0) {
              shell.chat.handleReload();
            } else {
              shell.chat.handleRetrySend();
            }
          },
          variant: "danger",
        });
      } else {
        actions.push({
          label: "Dismiss",
          onClick: () => setIsErrorDismissed(true),
          variant: "secondary",
        });
      }

      if (parsedError.actionType === "RETRY_OR_SETTINGS") {
        actions.push({
          label: "Change API Key",
          onClick: () => {
            shell.system.openSettings("apikeys");
            setIsErrorDismissed(true);
          },
          variant: "secondary",
        });
      }

      if (
        parsedError.actionType === "RETRY_OR_LINK" &&
        parsedError.meta?.link
      ) {
        actions.push({
          label: parsedError.meta.linkLabel || "Open Link",
          onClick: () => {
            invoke("open_external_url", {
              url: parsedError.meta?.link,
            });
            setIsErrorDismissed(true);
          },
          variant: "secondary",
        });
      }

      return actions;
    };

    return (
      <Dialog
        isOpen={!!error && !isErrorDismissed}
        variant="error"
        title={parsedError.title}
        message={parsedError.message}
        actions={getActions()}
      />
    );
  };

  return (
    <div className={styles.container}>
      <div ref={headerRef} className={styles.headerContainer}>
        <ImageShell
          startupImage={shell.system.startupImage}
          sessionLensUrl={shell.sessionLensUrl}
          setSessionLensUrl={shell.handleUpdateLensUrl}
          chatTitle={shell.chatTitle}
          onDescribeEdits={async (desc) => shell.chat.handleDescribeEdits(desc)}
          ocrData={shell.ocrData}
          onUpdateOCRData={shell.handleUpdateOCRData}
          onOpenSettings={shell.system.openSettings}
          isVisible={true}
          scrollContainerRef={scrollContainerRef}
          chatId={shell.chatHistory.activeSessionId}
          inputValue={shell.imageInput}
          onInputChange={shell.setImageInput}
          onToggleExpand={() => setIsImageExpanded(!isImageExpanded)}
          ocrEnabled={shell.system.ocrEnabled}
          autoExpandOCR={shell.system.autoExpandOCR}
          activeProfileId={shell.system.activeProfile?.id || null}
          downloadedOcrLanguages={shell.system.downloadedOcrLanguages}
          currentOcrModel={shell.system.sessionOcrLanguage}
          onOcrModelChange={shell.system.setSessionOcrLanguage}
        />
      </div>

      <ChatShell
        messages={shell.chat.messages}
        streamingText={shell.chat.streamingText}
        isChatMode={shell.chat.isChatMode}
        isLoading={shell.chat.isLoading}
        isStreaming={shell.chat.isStreaming}
        error={error}
        input={shell.input}
        startupImage={shell.system.startupImage}
        chatId={shell.chatHistory.activeSessionId}
        onSend={() => {
          shell.chat.handleSend(shell.input);
          shell.setInput("");
        }}
        onRetry={() => {
          if (shell.chat.messages.length === 0) {
            shell.chat.handleReload();
          } else {
            shell.chat.handleRetrySend();
          }
        }}
        onInputChange={shell.setInput}
        onOpenSettings={shell.system.openSettings}
        scrollContainerRef={scrollContainerRef}
      />
    </div>
  );
};

export const AppShell = React.memo(AppShellComponent);
