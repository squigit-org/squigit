/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { RotateCw, MessagesSquare } from "lucide-react";
import { ModelSelector } from "./ModelSelector";
import styles from "./ChatHeader.module.css";

interface ChatHeaderProps {
  chatTitle: string;
  onReload: () => void;
  isRotating: boolean;
  currentModel: string;
  onModelChange: (model: string) => void;
  isLoading: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  chatTitle,
  onReload,
  isRotating,
  currentModel,
  onModelChange,
  isLoading,
}) => {
  return (
    <header className={styles.header}>
      <div className={styles.leftSection}>
        <MessagesSquare size={18} className={styles.chatIcon} />
        <h1 className={styles.chatTitle}>{chatTitle}</h1>
      </div>

      <div className={styles.rightSection}>
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
