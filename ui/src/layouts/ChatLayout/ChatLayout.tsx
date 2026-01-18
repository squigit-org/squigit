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
  ForwardedRef,
} from "react";

import {
  ImageArea,
  Message,
  ChatArea,
  ChatInput,
  ChatHeader,
  ChatSession,
} from "../../features";

import { InlineMenu, useInlineMenu } from "../../components";

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

  // ChatHeader Props
  isRotating: boolean;
  isPanelActive: boolean;
  toggleSettingsPanel: () => void;
  isPanelVisible: boolean;
  isPanelActiveAndVisible: boolean;
  isPanelClosing: boolean;
  settingsButtonRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  settingsPanelRef: ForwardedRef<{ handleClose: () => Promise<boolean> }>;
  prompt: string;
  editingModel: string;
  setPrompt: (prompt: string) => void;
  onEditingModelChange: (model: string) => void;
  userName: string;
  userEmail: string;
  avatarSrc: string;
  onSave: (prompt: string, model: string) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onResetAPIKey: () => void;
  toggleSubview: (isActive: boolean) => void;
  onNewSession: () => void;
  hasImageLoaded: boolean;
}

export const ChatLayout: React.FC<ChatLayoutProps> = ({
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
  chatTitle,
  currentModel,
  onModelChange,
  sessions,
  activeSessionId,
  onSessionSelect,
  onNewChat,
  onReload,
  isRotating,
  isPanelActive,
  toggleSettingsPanel,
  isPanelVisible,
  isPanelActiveAndVisible,
  isPanelClosing,
  settingsButtonRef,
  panelRef,
  settingsPanelRef,
  prompt,
  editingModel,
  setPrompt,
  onEditingModelChange,
  userName,
  userEmail,
  avatarSrc,
  onSave,
  onLogout,
  isDarkMode,
  onToggleTheme,
  onResetAPIKey,
  toggleSubview,
  onNewSession,
  hasImageLoaded,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);

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
    <div className="flex h-full flex-col bg-neutral-950 text-neutral-100 selection:bg-black-500-30 selection:text-neutral-100 relative pb-24">
      <div className="flex-shrink-0">
        <ChatHeader
          chatTitle={chatTitle}
          onReload={onReload || (() => {})}
          isRotating={isRotating}
          currentModel={currentModel}
          onModelChange={onModelChange}
          isLoading={isLoading}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSessionSelect={onSessionSelect}
          onNewChat={onNewChat}
          isPanelActive={isPanelActive}
          toggleSettingsPanel={toggleSettingsPanel}
          isPanelVisible={isPanelVisible}
          isPanelActiveAndVisible={isPanelActiveAndVisible}
          isPanelClosing={isPanelClosing}
          settingsButtonRef={settingsButtonRef}
          panelRef={panelRef}
          settingsPanelRef={settingsPanelRef}
          prompt={prompt}
          editingModel={editingModel}
          setPrompt={setPrompt}
          onEditingModelChange={onEditingModelChange}
          userName={userName}
          userEmail={userEmail}
          avatarSrc={avatarSrc}
          onSave={onSave}
          onLogout={onLogout}
          isDarkMode={isDarkMode}
          onToggleTheme={onToggleTheme}
          onResetAPIKey={onResetAPIKey}
          toggleSubview={toggleSubview}
          onNewSession={onNewSession}
          hasImageLoaded={hasImageLoaded}
        />
      </div>

      <div className="z-10 relative flex-shrink-0">
        <ImageArea
          startupImage={startupImage}
          sessionLensUrl={sessionLensUrl}
          setSessionLensUrl={setSessionLensUrl}
          chatTitle={chatTitle}
          onDescribeEdits={onDescribeEdits}
          isVisible={true}
          scrollContainerRef={scrollContainerRef}
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
