/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { ImageShell, ChatShell, useShellContext } from "@/shell";
import {
  useAttachments,
  buildAttachmentMention,
} from "@/features/chat/components/AttachmentStrip";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import styles from "./AppShell.module.css";

const AppShellComponent: React.FC = () => {
  const shell = useShellContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { attachments, setAttachments, addFromPath, clearAttachments } =
    useAttachments();

  const error = shell.chat.error || shell.system.systemError;

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

  useEffect(() => {
    const unlistenPromise = listen<{ tempPath: string }>(
      "capture-to-input",
      (event) => {
        if (event.payload && event.payload.tempPath) {
          addFromPath(event.payload.tempPath);
        }
      },
    );
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, [addFromPath]);

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
          currentOcrModel={shell.system.sessionOcrLanguage}
          onOcrModelChange={shell.system.setSessionOcrLanguage}
          isOcrScanning={shell.isOcrScanning}
          onOcrScanningChange={shell.setIsOcrScanning}
          isExpanded={isImageExpanded}
        />
      </div>

      <div className="flex-1 min-h-0 relative flex flex-col">
        <ChatShell
          messages={shell.chat.messages}
          streamingText={shell.chat.streamingText}
          isLoading={shell.chat.isLoading}
          isStreaming={shell.chat.isStreaming}
          isAiTyping={shell.chat.isAiTyping}
          isAnalyzing={shell.chat.isAnalyzing}
          isGenerating={shell.chat.isGenerating}
          error={error}
          input={shell.input}
          startupImage={shell.system.startupImage}
          chatId={shell.chatHistory.activeSessionId}
          onSend={() => {
            let finalInput = shell.input;
            if (attachments.length > 0) {
              const mentions = attachments
                .map((a) => buildAttachmentMention(a.path))
                .join("\n");
              finalInput = `${shell.input}\n\n${mentions}`.trim();
            }
            shell.chat.handleSend(finalInput, shell.inputModel);
            shell.setInput("");
            clearAttachments();
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
          onSystemAction={shell.handleSystemAction}
          isNavigating={shell.isNavigating}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          onCaptureToInput={async () => {
            try {
              await invoke("spawn_capture_to_input");
            } catch (err) {
              console.error("Failed to spawn capture to input:", err);
            }
          }}
        />
      </div>
    </div>
  );
};

export const AppShell = React.memo(AppShellComponent);
