/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppContext } from "@/providers/AppProvider";
import { useInlineMenu } from "@/hooks";
import { InlineMenu, LoadingSpinner, TextShimmer, Dialog } from "@/components";
import {
  useAttachments,
  buildAttachmentMention,
  ChatInput,
  ImageArtifact,
  useChatScroll,
  useInputHeight,
  useChatWheel,
  useChatError,
  MessageList,
} from "@/features";
import styles from "./Chat.module.css";

export const Chat: React.FC = () => {
  const app = useAppContext();
  const { attachments, setAttachments, addFromPath, clearAttachments } =
    useAttachments();
  const [stopRequested, setStopRequested] = useState(false);

  // Refs
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(false);

  // Hooks
  const error = app.chat.error || app.system.systemError;
  const { isErrorOpen, parsedError, errorActions } = useChatError(
    error,
    app.system.openSettings,
  );
  const { isImageExpanded, setIsImageExpanded } = useChatWheel(
    headerRef,
    app.chatHistory.activeSessionId,
  );

  const { inputContainerRef, inputHeight } = useInputHeight({
    scrollContainerRef,
    wasAtBottomRef,
  });

  const { isSpinnerVisible } = useChatScroll({
    messages: app.chat.messages,
    chatId: app.chatHistory.activeSessionId,
    isNavigating: app.isNavigating,
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
    let finalInput = app.input;
    if (attachments.length > 0) {
      const mentions = attachments
        .map((a) => buildAttachmentMention(a.path))
        .join("\n");
      finalInput = `${app.input}\n\n${mentions}`.trim();
    }
    app.chat.handleSend(finalInput, app.inputModel);
    app.setInput("");
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
    <div className={styles.chatContainer}>
      <div ref={headerRef} className={styles.headerContainer}>
        <ImageArtifact
          startupImage={app.system.startupImage}
          sessionLensUrl={app.sessionLensUrl}
          setSessionLensUrl={app.handleUpdateLensUrl}
          chatTitle={app.chatTitle}
          onDescribeEdits={async (desc) => app.chat.handleDescribeEdits(desc)}
          ocrData={app.ocrData}
          onUpdateOCRData={app.handleUpdateOCRData}
          onOpenSettings={app.system.openSettings}
          isVisible={true}
          scrollContainerRef={scrollContainerRef}
          chatId={app.chatHistory.activeSessionId}
          inputValue={app.imageInput}
          onInputChange={app.setImageInput}
          onToggleExpand={() => setIsImageExpanded(!isImageExpanded)}
          ocrEnabled={app.system.ocrEnabled}
          autoExpandOCR={app.system.autoExpandOCR}
          activeProfileId={app.system.activeProfile?.id || null}
          currentOcrModel={app.system.sessionOcrLanguage}
          onOcrModelChange={app.system.setSessionOcrLanguage}
          isOcrScanning={app.isOcrScanning}
          onOcrScanningChange={app.setIsOcrScanning}
          isExpanded={isImageExpanded}
        />
      </div>
      <div className="flex-1 min-h-0 relative flex flex-col">
        <div
          className={`${styles.container} ${!app.system.startupImage ? styles.noImage : ""}`}
          ref={scrollContainerRef}
          style={
            { "--input-height": `${inputHeight}px` } as React.CSSProperties
          }
        >
          <main style={{ paddingBottom: inputHeight + 10 }}>
            <div
              className={`mx-auto w-full max-w-[45rem] px-4 md:px-8 pb-0 ${isSpinnerVisible || app.chat.isAnalyzing ? "-mt-2" : "pt-3"}`}
            >
              {app.chat.isAnalyzing && (
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
                  messages={app.chat.messages}
                  streamingText={app.chat.streamingText}
                  isGenerating={app.chat.isGenerating}
                  retryingMessageId={app.chat.retryingMessageId}
                  stopRequested={stopRequested}
                  selectedModel={app.inputModel}
                  isAnalyzing={app.chat.isAnalyzing}
                  onStreamComplete={app.chat.handleStreamComplete}
                  onTypingChange={app.chat.setIsAiTyping}
                  onStopGeneration={(truncatedText) =>
                    app.chat.handleStopGeneration(truncatedText)
                  }
                  onStopRequestedChange={setStopRequested}
                  onRetryMessage={app.chat.handleRetryMessage}
                  onEditMessage={app.chat.handleEditMessage}
                  onSystemAction={app.handleSystemAction}
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
              startupImage={app.system.startupImage}
              input={app.input}
              onInputChange={app.setInput}
              onSend={handleSend}
              isLoading={app.chat.isLoading}
              isAiTyping={app.chat.isAiTyping}
              isStoppable={app.chat.isAnalyzing || app.chat.isGenerating}
              onStopGeneration={() => {
                if (app.chat.isAiTyping) {
                  setStopRequested(true);
                } else {
                  app.chat.handleStopGeneration();
                }
              }}
              selectedModel={app.inputModel}
              onModelChange={app.setInputModel}
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
