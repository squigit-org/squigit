/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
} from "react";
import "katex/dist/katex.min.css";

import { Message } from "../../../types";
import { ContextMenu } from "./ContextMenu";
import { ChatHeader } from "./header/ChatHeader";
import { ChatArea } from "./ChatArea";
import { ChatInput } from "./ChatInput";
import "./ChatLayout.css";

export interface ChatLayoutProps {
  // States from engine
  messages: Message[];
  streamingText: string;
  isChatMode: boolean;
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  lastSentMessage: Message | null;

  // States from App
  input: string;
  currentModel: string;
  editingModel: string;

  // System-related states
  startupImage: { base64: string; mimeType: string } | null;
  prompt: string;
  userName: string;
  userEmail: string;
  avatarSrc: string;
  isDarkMode: boolean;

  // Handlers
  onSend: () => void;
  onModelChange: (model: string) => void;
  onEditingModelChange: (model: string) => void;
  onRetry: () => void;
  onSave: (prompt: string, model: string) => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  onInputChange: (value: string) => void;
  setPrompt: (prompt: string) => void;
  onCheckSettings: () => void;
  toggleSettingsPanel: () => void;
  isPanelActive: boolean;
  onResetAPIKey: () => void;
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
  editingModel,
  startupImage,
  prompt,
  userName,
  userEmail,
  avatarSrc,
  isDarkMode,
  onSend,
  onModelChange,
  onEditingModelChange,
  onRetry,
  onSave,
  onLogout,
  onToggleTheme,
  onInputChange,
  setPrompt,
  toggleSettingsPanel,
  onCheckSettings,
  isPanelActive,
  onResetAPIKey,
  onReload,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<{ handleClose: () => Promise<boolean> }>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [isSubviewActive, setIsSubviewActive] = useState(false);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [isPanelClosing, setIsPanelClosing] = useState(false);
  const [isPanelActiveAndVisible, setIsPanelActiveAndVisible] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);

  // --- Effects ---

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

  // Panel Animation Logic
  useEffect(() => {
    if (isPanelActive) {
      setIsPanelVisible(true);
      const timer = setTimeout(() => {
        setIsPanelActiveAndVisible(true);
      }, 10);
      return () => clearTimeout(timer);
    } else {
      setIsPanelActiveAndVisible(false);
      setIsPanelClosing(true);
      const timer = setTimeout(() => {
        setIsPanelVisible(false);
        setIsPanelClosing(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isPanelActive]);

  // Close Panel Logic
  const closeSettingsPanel = async () => {
    if (isPanelActive) {
      if (settingsPanelRef.current) {
        const canClose = await settingsPanelRef.current.handleClose();
        if (canClose) toggleSettingsPanel();
      } else {
        toggleSettingsPanel();
      }
    }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPanelActive) closeSettingsPanel();
    };

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      const isMsgBoxClick = target.closest(".error-overlay") || target.closest(".error-container");
      const isContextMenuClick = target.closest("#app-context-menu");

      if (
        isPanelActive &&
        panelRef.current &&
        !panelRef.current.contains(target as Node) &&
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(target as Node) &&
        !isMsgBoxClick &&
        !isContextMenuClick
      ) {
        closeSettingsPanel();
      }
    };

    document.addEventListener("keydown", handleEsc);
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isPanelActive, isSubviewActive]);

  // Context Menu Logic
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selectedText: string } | null>(null);

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
    const handleClick = () => { if (contextMenu) handleCloseContextMenu(); };
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
        isPanelActive={isPanelActive}
        toggleSettingsPanel={toggleSettingsPanel}
        onReload={handleReload}
        isRotating={isRotating}
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
        toggleSubview={setIsSubviewActive}
        currentModel={currentModel}
        onModelChange={onModelChange}
        isLoading={isLoading}
        isChatMode={isChatMode}
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
        prompt={prompt}
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

      <div id="feedbackMessage" className="feedback-message"></div>
      
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedText={contextMenu.selectedText}
          onCopy={handleCopy}
          onClose={handleCloseContextMenu}
        />
      )}
    </div>
  );
};