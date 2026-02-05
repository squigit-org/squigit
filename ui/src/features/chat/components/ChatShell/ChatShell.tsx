/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Message,
  ChatInput,
  ChatBubble,
  StreamingResponse,
} from "@/features/chat";
import { InlineMenu, useInlineMenu, Dialog, TextShimmer } from "@/widgets";
import { ImageArea } from "@/features/image";
import { parseGeminiError } from "@/lib/utils/errorParser";
import styles from "./ChatShell.module.css";
import "katex/dist/katex.min.css";

export interface ChatShellProps {
  messages: Message[];
  streamingText: string;
  isChatMode: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  lastSentMessage: Message | null;

  input: string;
  currentModel: string;

  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
    fromHistory?: boolean;
  } | null;

  chatTitle: string;
  chatId: string | null;

  sessionLensUrl: string | null;
  setSessionLensUrl: (url: string | null) => void;
  onDescribeEdits: (description: string) => Promise<void>;
  ocrData: { text: string; box: number[][] }[];
  onUpdateOCRData: (data: { text: string; box: number[][] }[]) => void;

  onSend: () => void;
  onModelChange: (model: string) => void;
  onRetry: () => void;
  onInputChange: (value: string) => void;
  onReload?: () => void;

  imageInputValue: string;
  onImageInputChange: (value: string) => void;

  ocrEnabled?: boolean;
  autoExpandOCR?: boolean;
  onStreamComplete?: () => void;
  activeProfileId: string | null;
}

const ChatShellComponent: React.FC<ChatShellProps> = ({
  messages,
  streamingText,
  isChatMode,
  isLoading,
  error,
  input,
  startupImage,
  onSend,
  onRetry,
  onInputChange,
  sessionLensUrl,
  setSessionLensUrl,
  onDescribeEdits,
  ocrData,
  onUpdateOCRData,
  chatTitle,
  chatId,
  imageInputValue,
  onImageInputChange,
  ocrEnabled = true,
  autoExpandOCR = true,
  onStreamComplete,
  activeProfileId,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showUpdate, setShowUpdate] = useState(false);
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
  }, [messages, chatId]);

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

  const [isImageExpanded, setIsImageExpanded] = useState(false);

  useEffect(() => {
    setIsImageExpanded(false);
  }, [chatId]);

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
          onClick: onRetry,
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

  const hasMessages = messages.filter((m) => m.role === "user").length > 0;

  return (
    <div className={styles.container}>
      <div ref={headerRef} className={styles.headerContainer}>
        <ImageArea
          startupImage={startupImage}
          sessionLensUrl={sessionLensUrl}
          setSessionLensUrl={setSessionLensUrl}
          chatTitle={chatTitle}
          onDescribeEdits={onDescribeEdits}
          ocrData={ocrData}
          onUpdateOCRData={onUpdateOCRData}
          isVisible={true}
          scrollContainerRef={scrollContainerRef}
          chatId={chatId}
          inputValue={imageInputValue}
          onInputChange={onImageInputChange}
          isExpanded={isImageExpanded}
          onToggleExpand={() => setIsImageExpanded(!isImageExpanded)}
          ocrEnabled={ocrEnabled}
          autoExpandOCR={autoExpandOCR}
          activeProfileId={activeProfileId}
        />
      </div>

      <div className={styles.chatArea} ref={scrollContainerRef}>
        <main>
          <div
            className={`mx-auto w-full max-w-[45rem] px-4 md:px-8 pb-4 ${
              hasMessages ? "pt-12" : "pt-20"
            }`}
          >
            {startupImage && !isChatMode && (
              <div className="min-h-[60vh]">
                {isLoading && !streamingText ? (
                  <TextShimmer variant="full" />
                ) : (
                  <StreamingResponse
                    text={streamingText}
                    onComplete={onStreamComplete}
                  />
                )}
              </div>
            )}

            {renderError()}

            {isChatMode && (
              <div className="space-y-8 flex flex-col-reverse">
                {isLoading && <TextShimmer variant="simple" />}

                {messages
                  .slice()
                  .reverse()
                  .map((msg) => (
                    <div key={msg.id} className="mb-2">
                      <ChatBubble message={msg} />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <ChatInput
        startupImage={startupImage}
        input={input}
        onInputChange={onInputChange}
        onSend={onSend}
        isLoading={isLoading}
      />

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
  );
};

export const ChatShell = React.memo(ChatShellComponent);
