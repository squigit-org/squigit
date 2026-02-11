/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { ImageShell, ChatShell } from "@/shell";
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
          isExpanded={isImageExpanded}
        />
      </div>

      <ChatShell
        messages={shell.chat.messages}
        streamingText={shell.chat.streamingText}
        isLoading={shell.chat.isLoading}
        isStreaming={shell.chat.isStreaming}
        isAiTyping={shell.chat.isAiTyping}
        error={error}
        input={shell.input}
        startupImage={shell.system.startupImage}
        chatId={shell.chatHistory.activeSessionId}
        onSend={() => {
          shell.chat.handleSend(shell.input, shell.inputModel);
          shell.setInput("");
        }}
        onInputChange={shell.setInput}
        onOpenSettings={shell.system.openSettings}
        onStreamComplete={shell.chat.handleStreamComplete}
        onTypingChange={shell.chat.setIsAiTyping}
        onStopGeneration={shell.chat.handleStopGeneration}
        onRetryMessage={shell.chat.handleRetryMessage}
        onEditMessage={shell.chat.handleEditMessage}
        retryingMessageId={shell.chat.retryingMessageId}
        scrollContainerRef={scrollContainerRef}
        selectedModel={shell.inputModel}
        onModelChange={shell.setInputModel}
      />
    </div>
  );
};

export const AppShell = React.memo(AppShellComponent);
