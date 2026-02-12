/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useLayoutEffect } from "react";
import { Message, ChatInput, ChatBubble } from "@/features/chat";
import { InlineMenu, TextShimmer, Dialog } from "@/primitives";
import { useInlineMenu } from "@/hooks";
import { SettingsSection } from "@/shell/overlays";
import { invoke } from "@tauri-apps/api/core";
import { parseGeminiError } from "@/lib/helpers";
import styles from "./ChatShell.module.css";

export interface ChatShellProps {
  messages: Message[];
  streamingText: string;
  isLoading: boolean;
  isStreaming: boolean;
  isAiTyping: boolean;
  error: string | null;

  input: string;
  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
    fromHistory?: boolean;
  } | null;

  chatId: string | null;

  onSend: () => void;
  onInputChange: (value: string) => void;
  onOpenSettings: (section: SettingsSection) => void;
  onStreamComplete?: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  onStopGeneration?: (truncatedText: string) => void;
  onRetryMessage?: (messageId: string, modelId?: string) => void;
  onEditMessage?: (
    messageId: string,
    newText: string,
    modelId?: string,
  ) => void;
  retryingMessageId?: string | null;

  selectedModel: string;
  onModelChange: (model: string) => void;

  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

export const ChatShell: React.FC<ChatShellProps> = ({
  messages,
  streamingText,
  isLoading,
  isAiTyping,
  error,
  input,
  startupImage,
  chatId,
  onSend,
  onInputChange,
  onOpenSettings,
  onStreamComplete,
  onTypingChange,
  onStopGeneration,
  onRetryMessage,
  onEditMessage,
  retryingMessageId,
  selectedModel,
  onModelChange,
  scrollContainerRef,
}) => {
  const [stopRequested, setStopRequested] = useState(false);
  const prevChatIdRef = useRef<string | null>(null);
  const prevMessageCountRef = useRef(messages.length);
  const [isErrorDismissed, setIsErrorDismissed] = useState(false);

  useEffect(() => {
    setIsErrorDismissed(false);
  }, [error]);

  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const chatChanged = prevChatIdRef.current !== chatId;
    const messageCountChanged = messages.length !== prevMessageCountRef.current;

    if (chatChanged) {
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
      setTimeout(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
      }, 50);
      prevChatIdRef.current = chatId;
    } else if (messageCountChanged) {
      if (prevMessageCountRef.current === 0 && messages.length > 0) {
        const isStreamCompletion =
          messages.length === 1 && messages[0]?.role === "model";
        if (!isStreamCompletion) {
          el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
        }
      } else {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === "user") {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages, chatId, scrollContainerRef]);

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

      const targetRect = {
        left: targetLeft,
        top: targetTop,
        width: menuWidth,
      };

      if (showFlatMenuRef.current) {
        showFlatMenuRef.current(targetRect);
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

  const renderError = () => {
    if (!error) return null;

    const parsedError = parseGeminiError(error);

    const getActions = () => {
      const actions: any[] = [];
      actions.push({
        label: "Dismiss",
        onClick: () => setIsErrorDismissed(true),
        variant: "secondary",
      });

      if (parsedError.actionType === "RETRY_OR_SETTINGS") {
        actions.push({
          label: "Change API Key",
          onClick: () => {
            onOpenSettings("apikeys");
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

  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState(0);
  const previousInputHeightRef = useRef(0);
  const wasAtBottomRef = useRef(false);

  useEffect(() => {
    const el = inputContainerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const scrollEl = scrollContainerRef.current;
      if (scrollEl) {
        const distanceFromBottom =
          scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
        wasAtBottomRef.current = distanceFromBottom < 20;
      }

      for (const entry of entries) {
        setInputHeight(entry.contentRect.height);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollContainerRef]);

  useLayoutEffect(() => {
    const scrollEl = scrollContainerRef.current;
    const isGrowing = inputHeight > previousInputHeightRef.current;

    if (!isGrowing && scrollEl && wasAtBottomRef.current) {
      scrollEl.scrollTop = scrollEl.scrollHeight;
    }
    previousInputHeightRef.current = inputHeight;
  }, [inputHeight]);

  const isAnalyzing =
    startupImage && isLoading && !streamingText && messages.length === 0;

  const retryIndex = retryingMessageId
    ? messages.findIndex((m) => m.id === retryingMessageId)
    : -1;

  const displayMessages =
    retryIndex !== -1 ? messages.slice(0, retryIndex + 1) : messages;

  return (
    <>
      <div
        className={styles.chatShell}
        ref={scrollContainerRef}
        style={
          {
            "--input-height": `${inputHeight}px`,
          } as React.CSSProperties
        }
      >
        <main style={{ paddingBottom: inputHeight + 10 }}>
          <div
            className={`mx-auto w-full max-w-[45rem] px-4 md:px-8 pb-0 ${
              isAnalyzing ? "-mt-2" : "pt-3"
            }`}
          >
            {isAnalyzing && <TextShimmer text="Analyzing your image" />}

            {renderError()}

            <div className="flex flex-col-reverse gap-[10px]">
              {isLoading && messages.length > 0 && (
                <TextShimmer text="Planning next moves" />
              )}
              {streamingText && (
                <div className="mb-0">
                  <ChatBubble
                    message={{
                      id: "streaming-temp",
                      role: "model",
                      text: streamingText,
                      timestamp: Date.now(),
                    }}
                    isStreamed={true}
                    onStreamComplete={onStreamComplete}
                    onTypingChange={onTypingChange}
                    stopRequested={stopRequested}
                    onStopGeneration={(truncatedText) => {
                      setStopRequested(false);
                      onStopGeneration?.(truncatedText);
                    }}
                  />
                </div>
              )}

              {displayMessages
                .slice()
                .reverse()
                .map((msg, index) => {
                  const isLatestModel = msg.role === "model" && index === 0;
                  return (
                    <div key={msg.id} className="mb-0">
                      <ChatBubble
                        message={msg}
                        isStreamed={isLatestModel}
                        onStreamComplete={
                          isLatestModel ? onStreamComplete : undefined
                        }
                        onTypingChange={
                          isLatestModel ? onTypingChange : undefined
                        }
                        stopRequested={
                          isLatestModel ? stopRequested : undefined
                        }
                        onStopGeneration={
                          isLatestModel
                            ? (truncatedText) => {
                                setStopRequested(false);
                                onStopGeneration?.(truncatedText);
                              }
                            : undefined
                        }
                        onRetry={
                          msg.role !== "user" && onRetryMessage
                            ? () => onRetryMessage(msg.id, selectedModel)
                            : undefined
                        }
                        isRetrying={msg.id === retryingMessageId}
                        onEdit={
                          msg.role === "user" && onEditMessage
                            ? (newText) =>
                                onEditMessage(msg.id, newText, selectedModel)
                            : undefined
                        }
                      />
                    </div>
                  );
                })}
            </div>
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
            startupImage={startupImage}
            input={input}
            onInputChange={onInputChange}
            onSend={onSend}
            isLoading={isLoading}
            isAiTyping={isAiTyping}
            onStopGeneration={() => setStopRequested(true)}
            selectedModel={selectedModel}
            onModelChange={onModelChange}
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
    </>
  );
};
