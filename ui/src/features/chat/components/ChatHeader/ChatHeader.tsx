/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { RotateCw, Plus } from "lucide-react";
import { ModelSelector } from "./ModelSelector";
import { ChatSelector } from "./ChatSelector";
import { ChatSession } from "../../types/chat.types";
import styles from "./ChatHeader.module.css";

interface ChatHeaderProps {
  chatTitle: string;
  onReload: () => void;
  isRotating: boolean;
  currentModel: string;
  onModelChange: (model: string) => void;
  isLoading: boolean;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSessionSelect: (id: string) => void;
  onNewChat: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  chatTitle,
  onReload,
  isRotating,
  currentModel,
  onModelChange,
  isLoading,
  sessions,
  activeSessionId,
  onSessionSelect,
  onNewChat,
}) => {
  return (
    <header className={styles.header}>
      <div className={styles.leftSection}>
        <ChatSelector
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSessionSelect={onSessionSelect}
          onNewChat={onNewChat}
        />
        <h1 className={styles.chatTitle}>{chatTitle}</h1>
      </div>

      <div className={styles.rightSection}>
        <button
          className={styles.iconButton}
          onClick={onNewChat}
          title="New chat"
        >
          <Plus size={20} />
        </button>

        <ModelSelector
          currentModel={currentModel}
          onModelChange={onModelChange}
          isLoading={isLoading}
        />

        <button
          onClick={onReload}
          className={styles.iconButton}
          title="Reload chat"
          disabled={isRotating}
        >
          <RotateCw size={20} className={isRotating ? styles.rotating : ""} />
        </button>
      </div>
    </header>
  );
};
