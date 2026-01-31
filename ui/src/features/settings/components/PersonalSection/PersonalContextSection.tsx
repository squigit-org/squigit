/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import styles from "./PersonalContextSection.module.css";
import { TextContextMenu, useClipboard } from "../../../../widgets";

interface PersonalContextSectionProps {
  localPrompt: string;
  setLocalPrompt: (prompt: string) => void;
  onSavePersonalContext: () => void;
}

export const PersonalContextSection: React.FC<PersonalContextSectionProps> = ({
  localPrompt,
  setLocalPrompt,
  onSavePersonalContext,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    x: number;
    y: number;
  }>({
    isOpen: false,
    x: 0,
    y: 0,
  });
  const [hasSelection, setHasSelection] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<string[]>([localPrompt]);
  const historyIndexRef = useRef<number>(0);
  const isUndoRedoRef = useRef<boolean>(false);
  const { readText } = useClipboard();

  // Sync history when prop changes (unless it's an undo/redo action)
  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;
    if (localPrompt !== currentHistory[currentIndex]) {
      historyRef.current = currentHistory.slice(0, currentIndex + 1);
      historyRef.current.push(localPrompt);
      historyIndexRef.current = historyRef.current.length - 1;
      if (historyRef.current.length > 100) {
        historyRef.current = historyRef.current.slice(-100);
        historyIndexRef.current = historyRef.current.length - 1;
      }
    }
  }, [localPrompt]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;

    const handleSelectionChange = () => {
      if (document.activeElement === ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        setHasSelection(start !== end);
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu({ isOpen: false, x: 0, y: 0 });
  };

  const handleCopy = () => {
    const ta = taRef.current;
    if (!ta) return;
    const selectedText = ta.value.substring(ta.selectionStart, ta.selectionEnd);
    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
    }
  };

  const handleCut = () => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selectedText = ta.value.substring(start, end);
    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
      const newValue = ta.value.substring(0, start) + ta.value.substring(end);
      setLocalPrompt(newValue);
      setTimeout(() => {
        ta.setSelectionRange(start, start);
        ta.focus();
      }, 0);
    }
  };

  const handlePaste = async () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    try {
      const text = await readText();
      if (!text) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newValue =
        ta.value.substring(0, start) + text + ta.value.substring(end);
      setLocalPrompt(newValue);
      const newCursorPos = start + text.length;
      setTimeout(() => {
        ta.setSelectionRange(newCursorPos, newCursorPos);
        ta.focus();
      }, 0);
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  };

  const handleSelectAll = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.select();
    setHasSelection(true);
  };

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      isUndoRedoRef.current = true;
      setLocalPrompt(historyRef.current[historyIndexRef.current]);
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      isUndoRedoRef.current = true;
      setLocalPrompt(historyRef.current[historyIndexRef.current]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case "z":
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
          return;
        case "y":
          e.preventDefault();
          handleRedo();
          return;
        case "a":
          e.preventDefault();
          handleSelectAll();
          return;
      }
    }
  };

  return (
    <>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Personal Context</h2>
      </div>

      <div className={styles.section}>
        <div className={styles.controlsRow}>
          <p className={styles.description}>System Prompt</p>

          <button className={styles.keyBtn} onClick={onSavePersonalContext}>
            Apply Changes
          </button>
        </div>

        <div className={styles.textareaWrapper}>
          <textarea
            ref={taRef}
            className={styles.textarea}
            placeholder="e.g., I prefer concise answers. I'm a software developer working mainly with React and TypeScript..."
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            onContextMenu={handleContextMenu}
            onKeyDown={handleKeyDown}
          />
        </div>
        <p className={styles.noteText}>
          ➤ Add context about yourself, your preferences, or specific
          instructions for the AI.
        </p>
      </div>

      {contextMenu.isOpen && (
        <TextContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onSelectAll={handleSelectAll}
          hasSelection={hasSelection}
        />
      )}
    </>
  );
};
