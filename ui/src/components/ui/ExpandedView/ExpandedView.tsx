/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { X, Download } from "lucide-react";
import { ChatInput } from "../../../features/chat/components/ChatInput/ChatInput";
import styles from "./ExpandedView.module.css";

interface ExpandedViewProps {
  isOpen: boolean;
  imageSrc: string;
  chatTitle: string;
  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
  } | null;
  onClose: () => void;
  onSave: () => void;
  onSubmit: (editDescription: string) => void;
}

export const ExpandedView: React.FC<ExpandedViewProps> = ({
  isOpen,
  imageSrc,
  chatTitle,
  startupImage,
  onClose,
  onSave,
  onSubmit,
}) => {
  const [editInput, setEditInput] = useState("");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Small delay for animation
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSend = () => {
    if (editInput.trim()) {
      onSubmit(editInput.trim());
      setEditInput("");
    }
  };

  return (
    <div className={`${styles.overlay} ${isVisible ? styles.visible : ""}`}>
      <div className={styles.backdrop} onClick={onClose} />

      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              className={styles.closeButton}
              onClick={onClose}
              title="Close"
            >
              <X size={20} />
            </button>
            <h1 className={styles.title}>{chatTitle}</h1>
          </div>

          <div className={styles.headerRight}>
            <button className={styles.saveButton} onClick={onSave} title="Save">
              <Download size={16} />
              <span>Save</span>
            </button>
          </div>
        </header>

        <main className={styles.content}>
          <img
            src={imageSrc}
            alt=""
            className={styles.image}
            draggable={false}
          />
        </main>

        <footer className={styles.footer}>
          <ChatInput
            startupImage={startupImage}
            input={editInput}
            onInputChange={setEditInput}
            onSend={handleSend}
            isLoading={false}
            placeholder="Ask about this image"
          />
        </footer>
      </div>
    </div>
  );
};
