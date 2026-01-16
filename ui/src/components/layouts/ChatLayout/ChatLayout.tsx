/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import {
  Message,
  ChatArea,
  ChatInput,
  ChatSession,
} from "../../../features/chat";
import { InlineMenu, useInlineMenu } from "../../../components/ui";
import { InlineEditor } from "../../layouts/InlineEditor/InlineEditor";
import "katex/dist/katex.min.css";
import "./ChatLayout.module.css";

export interface ChatLayoutProps {
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
  } | null;

  chatTitle: string;

  // Inline Editor Props
  sessionLensUrl: string | null;
  setSessionLensUrl: (url: string | null) => void;
  onDescribeEdits: (description: string) => Promise<void>;

  sessions: ChatSession[];
  activeSessionId: string | null;
  onSessionSelect: (id: string) => void;
  onNewChat: () => void;

  onSend: () => void;
  onModelChange: (model: string) => void;
  onRetry: () => void;
  onInputChange: (value: string) => void;
  onCheckSettings: () => void;
  onReload?: () => void;
}

export const ChatLayout: React.FC<ChatLayoutProps> = ({
  messages,
  streamingText,
  isChatMode,
  isLoading,
  isStreaming,
  error,
  input,
  /* currentModel, removed usage */
  startupImage,
  /* chatTitle, removed usage */
  /* sessions, removed usage */
  /* activeSessionId, removed usage */
  /* onSessionSelect, removed usage */
  /* onNewChat, removed usage */
  onSend,
  /* onModelChange, removed usage */
  onRetry,
  onInputChange,
  onCheckSettings,
  /* onReload, removed usage */
  sessionLensUrl,
  setSessionLensUrl,
  onDescribeEdits,
  chatTitle,
}) => {
  /* ... hooks ... */
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);

  /* ... useLayoutEffect ... */
  useLayoutEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];

      if (lastMessage.role === "user") {
        const el = scrollContainerRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    }
  }, [messages.length]);

  const showFlatMenuRef = useRef<
    ((rect: { left: number; width: number; top: number }) => void) | null
  >(null);

  /* ... handleSelectAll and useInlineMenu ... */
  const handleSelectAll = () => {
    /* ... logic ... */
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
        Math.min(centerX - menuWidth / 2, window.innerWidth - menuWidth - 10)
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

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-100 selection:bg-black-500-30 selection:text-neutral-100 relative">
      <div className="z-10 relative">
        <InlineEditor
          startupImage={startupImage}
          sessionLensUrl={sessionLensUrl}
          setSessionLensUrl={setSessionLensUrl}
          chatTitle={chatTitle}
          onDescribeEdits={onDescribeEdits}
          isVisible={true}
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
