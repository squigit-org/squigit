/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useLayoutEffect } from "react";

import { invoke } from "@tauri-apps/api/core";
import { ImageArea, Message, ChatArea, ChatInput } from "../../features";

import { InlineMenu } from "../../components";
import { useInlineMenu } from "../../components/InlineMenu/useInlineMenu";

import "katex/dist/katex.min.css";
import styles from "./ChatLayout.module.css";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

export interface ChatLayoutProps {
  messages: Message[];
  streamingText: string;
  isChatMode: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  lastSentMessage: Message | null;

  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
  } | null;

  chatTitle: string;

  sessionLensUrl: string | null;
  setSessionLensUrl: (url: string | null) => void;
  onDescribeEdits: (description: string) => Promise<void>;
  onImageUpload: (
    data: string | { path?: string; base64?: string; mimeType: string },
  ) => void;

  onRetry: () => void;
  onCheckSettings: () => void;
  onSend: (text: string) => void;
  ocrData?: { text: string; box: number[][] }[];
  onUpdateOCRData: (data: { text: string; box: number[][] }[]) => void;
  sessionId: string;
}

export const ChatLayout: React.FC<ChatLayoutProps> = ({
  messages,
  streamingText,
  isChatMode,
  isLoading,
  error,
  startupImage,
  onRetry,
  onCheckSettings,
  sessionLensUrl,
  setSessionLensUrl,
  onDescribeEdits,
  onImageUpload,
  chatTitle,
  onSend,
  ocrData,
  onUpdateOCRData,
  sessionId,
}) => {
  // Each tab instance owns its own input state
  const [input, setInput] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const processFiles = async (files: FileList) => {
    const file = files[0];
    if (!file || !ALLOWED_TYPES.includes(file.type) || file.size > MAX_SIZE) {
      return;
    }

    try {
      let result: string | { path?: string; mimeType: string };

      // @ts-ignore
      if ((file as any).path) {
        // @ts-ignore
        result = await invoke("read_image_file", { path: (file as any).path });
      } else {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        result = await invoke("process_image_bytes", {
          bytes: Array.from(bytes),
        });
      }
      onImageUpload(result);
    } catch (error) {
      console.error("Failed to process file", error);
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    if (e.dataTransfer.files?.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  // Handle send - clears input after sending
  const handleSend = () => {
    if (input.trim()) {
      onSend(input);
      setInput("");
    }
  };

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

  return (
    <div
      className={styles.container}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            color: "white",
            fontSize: "1.5rem",
          }}
        >
          Drop to replace image
        </div>
      )}
      <div className={styles.imageSection}>
        <ImageArea
          startupImage={startupImage}
          sessionLensUrl={sessionLensUrl}
          setSessionLensUrl={setSessionLensUrl}
          chatTitle={chatTitle}
          onDescribeEdits={onDescribeEdits}
          isVisible={true}
          scrollContainerRef={scrollContainerRef}
          ocrData={ocrData || []}
          onUpdateOCRData={onUpdateOCRData}
          sessionId={sessionId}
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
        onInputChange={setInput}
        onSend={handleSend}
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
