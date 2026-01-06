/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { Message, ChatHeader, ChatArea, ChatInput } from "..";
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
  currentModel,
  startupImage,
  chatTitle,
  onSend,
  onModelChange,
  onRetry,
  onInputChange,
  onCheckSettings,
  onReload,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setIsRotating(false);
    }
  }, [isLoading]);

  useLayoutEffect(() => {
    if (isStreaming) return;
    if (messages.length > 0) {
      const el = scrollContainerRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, isStreaming]);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    selectedText: string;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const selectedText = window.getSelection()?.toString() || "";
    if (selectedText) {
      setContextMenu({ x: e.clientX, y: e.clientY, selectedText });
    }
  };

  const handleCloseContextMenu = () => setContextMenu(null);
  const handleCopy = () => {
    if (contextMenu?.selectedText) {
      navigator.clipboard.writeText(contextMenu.selectedText);
    }
  };

  useEffect(() => {
    const handleClick = () => {
      if (contextMenu) handleCloseContextMenu();
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [contextMenu]);

  const handleReload = () => {
    if (onReload) {
      setIsRotating(true);
      onReload();
    }
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      className="flex h-screen flex-col bg-neutral-950 text-neutral-100 selection:bg-black-500-30 selection:text-neutral-100"
    >
      <ChatHeader
        chatTitle={chatTitle}
        onReload={handleReload}
        isRotating={isRotating}
        currentModel={currentModel}
        onModelChange={onModelChange}
        isLoading={isLoading}
      />

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
    </div>
  );
};
