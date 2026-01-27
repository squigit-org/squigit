/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
} from "react";

import { ImageArea, Message, ChatArea, ChatInput } from "../../features";
import { InlineMenu } from "../../components";
import { useInlineMenu } from "../../components/InlineMenu/useInlineMenu";

import "katex/dist/katex.min.css";

export interface ChatChildProps {
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
  onCheckSettings: () => void;
  onReload?: () => void;

  imageInputValue: string;
  onImageInputChange: (value: string) => void;
}

export const ChatChild: React.FC<ChatChildProps> = ({
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
  onCheckSettings,
  sessionLensUrl,
  setSessionLensUrl,
  onDescribeEdits,
  ocrData,
  onUpdateOCRData,
  chatTitle,
  chatId,
  imageInputValue,
  onImageInputChange,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const prevChatIdRef = useRef<string | null>(null);
  const prevMessageCountRef = useRef(messages.length);

  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const chatChanged = prevChatIdRef.current !== chatId;
    const messageCountChanged = messages.length !== prevMessageCountRef.current;

    if (chatChanged) {
      el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
      prevChatIdRef.current = chatId;
    } else if (messageCountChanged) {
      if (prevMessageCountRef.current === 0 && messages.length > 0) {
        el.scrollTo({ top: el.scrollHeight, behavior: "instant" });
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

  return (
    <div className="flex h-full flex-col bg-neutral-transparent text-neutral-100 selection:bg-black-500-30 selection:text-neutral-100 relative">
      <div
        ref={headerRef}
        className="z-10 absolute top-0 w-full flex-shrink-0"
        style={{
          backgroundColor: "var(--neutral-950)",
          maskImage:
            "linear-gradient(to bottom, black calc(100% - 12px), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black calc(100% - 12px), transparent 100%)",
        }}
      >
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
        />
      </div>

      <ChatArea
        ref={scrollContainerRef}
        startupImage={startupImage}
        isChatMode={isChatMode}
        isLoading={isLoading}
        streamingText={streamingText}
        error={error}
        onCheckSettings={onCheckSettings}
        onRetry={onRetry}
        prompt={""}
        showUpdate={showUpdate}
        setShowUpdate={setShowUpdate}
        messages={messages}
      />

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

