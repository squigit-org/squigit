/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from "react";
import { ChevronUp, Loader2 } from "lucide-react";
import { TextContextMenu, useClipboard } from "../../../../components";
import styles from "./InlineInput.module.css";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onLensClick: (query: string) => void;
  onTranslateClick: () => void;
  onCollapse?: () => void;
  isLensLoading: boolean;
  isTranslateDisabled: boolean;
  isOCRLoading: boolean;
  isExpanded?: boolean;
  placeholder?: string;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onLensClick,
  onTranslateClick,
  onCollapse,
  isLensLoading,
  isTranslateDisabled,
  isOCRLoading,
  isExpanded = false,
  placeholder = "Add to your search",
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
  });
  const [hasSelection, setHasSelection] = useState(false);
  const { readText } = useClipboard();

  const historyRef = useRef<string[]>([value]);
  const historyIndexRef = useRef<number>(0);
  const isUndoRedoRef = useRef<boolean>(false);

  useEffect(() => {
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }
    const currentHistory = historyRef.current;
    const currentIndex = historyIndexRef.current;
    if (value !== currentHistory[currentIndex]) {
      historyRef.current = currentHistory.slice(0, currentIndex + 1);
      historyRef.current.push(value);
      historyIndexRef.current = historyRef.current.length - 1;
      if (historyRef.current.length > 100) {
        historyRef.current = historyRef.current.slice(-100);
        historyIndexRef.current = historyRef.current.length - 1;
      }
    }
  }, [value]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const handleSelectionChange = () => {
      if (document.activeElement === input) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
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
    return false;
  };

  const handleCloseContextMenu = () => {
    setContextMenu({ isOpen: false, x: 0, y: 0 });
  };

  const handleCopy = () => {
    const input = inputRef.current;
    if (!input) return;
    const selectedText = input.value.substring(
      input.selectionStart || 0,
      input.selectionEnd || 0,
    );
    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
    }
  };

  const handleCut = () => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const selectedText = input.value.substring(start, end);
    if (selectedText) {
      navigator.clipboard.writeText(selectedText);
      const newValue =
        input.value.substring(0, start) + input.value.substring(end);
      onChange(newValue);
      setTimeout(() => {
        input.setSelectionRange(start, start);
        input.focus();
      }, 0);
    }
  };

  const handlePaste = async () => {
    const input = inputRef.current;
    if (!input) return;

    // Ensure focus is on the input to satisfy clipboard API requirements
    input.focus();

    try {
      const text = await readText();
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const newValue =
        input.value.substring(0, start) + text + input.value.substring(end);
      onChange(newValue);
      const newCursorPos = start + text.length;
      setTimeout(() => {
        input.setSelectionRange(newCursorPos, newCursorPos);
        input.focus();
      }, 0);
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  };

  const handleSelectAll = () => {
    const input = inputRef.current;
    if (!input) return;
    input.select();
    setHasSelection(true);
  };

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      isUndoRedoRef.current = true;
      onChange(historyRef.current[historyIndexRef.current]);
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      isUndoRedoRef.current = true;
      onChange(historyRef.current[historyIndexRef.current]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

    // Prevent new lines
    if (e.key === "Enter") {
      e.preventDefault();
      // Trigger lens search on Enter
      if (!isLensLoading && !isOCRLoading) {
        onLensClick(value);
      }
    }
  };

  return (
    <div className={styles.searchContainer}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        placeholder={placeholder}
        disabled={isOCRLoading}
        className={styles.searchInput}
      />

      <div className={styles.searchActions}>
        {/* Only show action buttons when not expanded */}
        {!isExpanded && (
          <>
            {/* Google Lens button */}
            <button
              className={styles.actionBtn}
              onClick={() => onLensClick(value)}
              disabled={isLensLoading || isOCRLoading}
              title="Search with Google Lens"
            >
              {isLensLoading ? (
                <Loader2 size={20} className={styles.spinning} />
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              )}
            </button>

            {/* Translate button */}
            <button
              className={styles.actionBtn}
              onClick={onTranslateClick}
              disabled={isTranslateDisabled || isOCRLoading}
              title="Translate all text"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 8 6 6" />
                <path d="m4 14 6-6 2-3" />
                <path d="M2 5h12" />
                <path d="M7 2h1" />
                <path d="m22 22-5-10-5 10" />
                <path d="M14 18h6" />
              </svg>
            </button>
          </>
        )}

        {/* Collapse button when expanded */}
        {isExpanded && onCollapse && (
          <button
            className={styles.actionBtn}
            onClick={onCollapse}
            title="Collapse"
          >
            <ChevronUp size={22} />
          </button>
        )}
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
    </div>
  );
};

// Keep ChatInput as an alias for backward compatibility, but it just returns null now
// TODO: Remove this after cleaning up all usages
export const ChatInput: React.FC<{
  startupImage: any;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  placeholder?: string;
  variant?: string;
}> = () => null;

export default SearchInput;
