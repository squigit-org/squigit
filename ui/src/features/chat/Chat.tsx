/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from "react";
import { useShellContext } from "@/providers/ShellProvider";
import { useAttachments } from "./components/AttachmentStrip/useAttachments";
import { buildAttachmentMention } from "./components/AttachmentStrip/attachment.types";
import { ChatInput } from "./components/ChatInput/ChatInput";
import { ImageArtifact } from "./components/ImageArtifact/ImageArtifact";
import { InlineMenu, LoadingSpinner, TextShimmer, Dialog } from "@/components";
import { useInlineMenu } from "@/hooks";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useChatScroll } from "./hooks/useChatScroll";
import { useInputHeight } from "./hooks/useInputHeight";
import { useChatWheel } from "./hooks/useChatWheel";
import { useChatError } from "./hooks/useChatError";
import { MessageList } from "./components/ChatBubble/MessageList";
import styles from "./Chat.module.css";

export const Chat: React.FC = () => {
  const shell = useShellContext();
  const { attachments, setAttachments, addFromPath, clearAttachments } =
    useAttachments();
  const [stopRequested, setStopRequested] = useState(false);

  // Refs
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(false);

  // Hooks
  const error = shell.chat.error || shell.system.systemError;
  const { isErrorOpen, parsedError, errorActions } = useChatError(
    error,
    shell.system.openSettings,
  );
  const { isImageExpanded, setIsImageExpanded } = useChatWheel(
    headerRef,
    shell.chatHistory.activeSessionId,
  );

  const { inputContainerRef, inputHeight } = useInputHeight({
    scrollContainerRef,
    wasAtBottomRef,
  });

  const { isSpinnerVisible } = useChatScroll({
    messages: shell.chat.messages,
    chatId: shell.chatHistory.activeSessionId,
    isNavigating: shell.isNavigating,
    inputHeight,
    scrollContainerRef,
    wasAtBottomRef,
  });

  // Capture listen
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

  // Menu Hooks
  const showFlatMenuRef = useRef<
    ((rect: { left: number; width: number; top: number }) => void) | null
  >(null);

  const handleSelectAll = () => {
    const selection = window.getSelection();
    if (!selection || !selection.anchorNode) return;

    const anchorNode = selection.anchorNode;
    const element =
      anchorNode instanceof Element ? anchorNode : anchorNode.parentElement;
    const bubble = element?.closest('[data-component="chat-bubble"]');

    if (bubble) {
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(bubble);
      selection.addRange(range);

      const rect = bubble.getBoundingClientRect();
      const menuWidth = 250;
      const centerX = rect.left + rect.width / 2;
      const targetLeft = Math.max(
        10,
        Math.min(centerX - menuWidth / 2, window.innerWidth - menuWidth - 10),
      );
      const targetTop = Math.max(10, rect.top + 2);

      if (showFlatMenuRef.current) {
        showFlatMenuRef.current({
          left: targetLeft,
          top: targetTop,
          width: menuWidth,
        });
      }
    }
  };

  const {
    menuRef,
    sliderRef,
    page1Ref,
    page2Ref,
    pageFlatRef,
    handleAction,
    switchPage,
    showFlatMenu,
  } = useInlineMenu({
    containerRef: scrollContainerRef,
    onSelectAll: handleSelectAll,
  });

  useEffect(() => {
    showFlatMenuRef.current = showFlatMenu;
  }, [showFlatMenu]);

  // Handlers
  const handleSend = () => {
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
  };

  const handleCaptureToInput = async () => {
    try {
      await invoke("spawn_capture_to_input");
    } catch (err) {
      console.error("Failed to spawn capture to input:", err);
    }
  };

  return (
    <div className={styles.appContainer}>
      <div ref={headerRef} className={styles.headerContainer}>
        <ImageArtifact
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
        <div
          className={`${styles.container} ${!shell.system.startupImage ? styles.noImage : ""}`}
          ref={scrollContainerRef}
          style={
            { "--input-height": `${inputHeight}px` } as React.CSSProperties
          }
        >
          <main style={{ paddingBottom: inputHeight + 10 }}>
            <div
              className={`mx-auto w-full max-w-[45rem] px-4 md:px-8 pb-0 ${isSpinnerVisible || shell.chat.isAnalyzing ? "-mt-2" : "pt-3"}`}
            >
              {shell.chat.isAnalyzing && (
                <TextShimmer text="Analyzing your image" />
              )}

              {parsedError && (
                <Dialog
                  isOpen={isErrorOpen}
                  variant="error"
                  title={parsedError.title}
                  message={parsedError.message}
                  actions={errorActions}
                />
              )}

              {isSpinnerVisible ? (
                <div className="flex justify-center pt-3">
                  <LoadingSpinner />
                </div>
              ) : (
                <MessageList
                  messages={shell.chat.messages}
                  streamingText={shell.chat.streamingText}
                  isGenerating={shell.chat.isGenerating}
                  retryingMessageId={shell.chat.retryingMessageId}
                  stopRequested={stopRequested}
                  selectedModel={shell.inputModel}
                  isAnalyzing={shell.chat.isAnalyzing}
                  onStreamComplete={shell.chat.handleStreamComplete}
                  onTypingChange={shell.chat.setIsAiTyping}
                  onStopGeneration={(truncatedText) =>
                    shell.chat.handleStopGeneration(truncatedText)
                  }
                  onStopRequestedChange={setStopRequested}
                  onRetryMessage={shell.chat.handleRetryMessage}
                  onEditMessage={shell.chat.handleEditMessage}
                  onSystemAction={shell.handleSystemAction}
                />
              )}
            </div>
          </main>
        </div>

        <div
          ref={inputContainerRef}
          className={styles.inputOverlay}
          style={{ pointerEvents: "none" }}
        >
          <div style={{ pointerEvents: "auto", width: "100%" }}>
            <ChatInput
              startupImage={shell.system.startupImage}
              input={shell.input}
              onInputChange={shell.setInput}
              onSend={handleSend}
              isLoading={shell.chat.isLoading}
              isAiTyping={shell.chat.isAiTyping}
              isStoppable={shell.chat.isAnalyzing || shell.chat.isGenerating}
              onStopGeneration={() => {
                if (shell.chat.isAiTyping) {
                  setStopRequested(true);
                } else {
                  shell.chat.handleStopGeneration();
                }
              }}
              selectedModel={shell.inputModel}
              onModelChange={shell.setInputModel}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              onCaptureToInput={handleCaptureToInput}
            />
          </div>
        </div>

        <InlineMenu
          menuRef={menuRef}
          sliderRef={sliderRef}
          page1Ref={page1Ref}
          page2Ref={page2Ref}
          pageFlatRef={pageFlatRef}
          onAction={handleAction}
          onSwitchPage={switchPage}
        />
      </div>
    </div>
  );
};
