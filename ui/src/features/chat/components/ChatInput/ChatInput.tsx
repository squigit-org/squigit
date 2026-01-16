/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useLayoutEffect, useRef, useState, useEffect } from "react";
import { Send } from "lucide-react";
import { CodeBlock } from "../CodeBlock/CodeBlock";
import { ContextMenu } from "../../../../components/ui/ContextMenu/ContextMenu";
import styles from "./ChatInput.module.css";

const ExpandIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 10V4h6" />
    <path d="M20 14v6h-6" />
  </svg>
);

const CollapseIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 4v6H4" />
    <path d="M14 20v-6h6" />
  </svg>
);

interface ChatInputProps {
  startupImage: {
    base64: string;
    mimeType: string;
    isFilePath?: boolean;
  } | null;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  placeholder?: string;
  variant?: "default" | "transparent";
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  startupImage,
  input: value,
  onInputChange: onChange,
  onSend,
  isLoading,
  placeholder: customPlaceholder,
  variant = "default",
}) => {
  if (!startupImage) return null;

  const maxRows = 7;
  const placeholder =
    customPlaceholder || (isLoading ? "Thinking..." : "Ask anything");
  const disabled = isLoading;

  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const codeTaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineHeightRef = useRef<number>(24);

  const [isManualExpanded, setIsManualExpanded] = useState(false);
  const [showExpandBtn, setShowExpandBtn] = useState(false);

  const [isCodeBlockActive, setIsCodeBlockActive] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState("");
  const [originalCodeLanguage, setOriginalCodeLanguage] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [consecutiveEnters, setConsecutiveEnters] = useState(0);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
  });
  const [hasSelection, setHasSelection] = useState(false);

  const historyRef = useRef<string[]>([value]);
  const historyIndexRef = useRef<number>(0);
  const isUndoRedoRef = useRef<boolean>(false);

  const isExpandedLayout = value.includes("\n") || isCodeBlockActive;

  useEffect(() => {
    if (isCodeBlockActive) {
      codeTaRef.current?.focus();
    }
  }, [isCodeBlockActive]);

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

  const adjustHeight = React.useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;

    ta.style.height = "auto";
    const scrollHeight = ta.scrollHeight;

    const standardMaxHeight = lineHeightRef.current * maxRows;
    const effectiveMaxHeight = isManualExpanded
      ? standardMaxHeight * 2
      : standardMaxHeight;

    if (scrollHeight > standardMaxHeight) {
      setShowExpandBtn(true);
    } else {
      setShowExpandBtn(false);
    }

    if (scrollHeight > effectiveMaxHeight) {
      ta.style.height = `${effectiveMaxHeight}px`;
      ta.style.overflowY = "auto";
    } else {
      ta.style.height = `${scrollHeight}px`;
      ta.style.overflowY = "hidden";
    }

    if (isManualExpanded) {
      ta.scrollTop = 0;
    }
  }, [isManualExpanded, maxRows]);

  useLayoutEffect(() => {
    adjustHeight();
  }, [value, maxRows, isManualExpanded, isExpandedLayout, adjustHeight]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;

    const observer = new ResizeObserver(() => {
      adjustHeight();
    });

    observer.observe(ta);

    return () => observer.disconnect();
  }, [adjustHeight]);

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
      onChange(newValue);
      setTimeout(() => {
        ta.setSelectionRange(start, start);
        ta.focus();
      }, 0);
    }
  };

  const handlePaste = async () => {
    const ta = taRef.current;
    if (!ta) return;
    try {
      const text = await navigator.clipboard.readText();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newValue =
        ta.value.substring(0, start) + text + ta.value.substring(end);
      onChange(newValue);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case "c":
          e.preventDefault();
          handleCopy();
          return;
        case "v":
          e.preventDefault();
          handlePaste();
          return;
        case "x":
          e.preventDefault();
          handleCut();
          return;
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

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !isLoading && value.trim().length > 0) onSend();
    }
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setIsCodeBlockActive(false);
      onChange(`${value}\`\`\`${originalCodeLanguage}\n`);
      setCodeValue("");
      setCodeLanguage("");
      setOriginalCodeLanguage("");
      setConsecutiveEnters(0);
      setTimeout(() => {
        const ta = taRef.current;
        if (ta) {
          ta.focus();
          const end = ta.value.length;
          ta.setSelectionRange(end, end);
        }
      }, 0);
    } else if (e.key === "Enter") {
      setConsecutiveEnters((prev) => prev + 1);
      if (consecutiveEnters >= 2) {
        setIsCodeBlockActive(false);
        const newPrompt = `${value}\n\`\`\`${codeLanguage}\n${codeValue.trim()}\n\`\`\`\n`;
        onChange(newPrompt);
        setCodeValue("");
        setCodeLanguage("");
        setOriginalCodeLanguage("");
        setConsecutiveEnters(0);
        setTimeout(() => taRef.current?.focus(), 0);
      }
    } else {
      setConsecutiveEnters(0);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const match = newValue.match(/(^|\n)```([^\n]*)\n$/);

    if (match && !isCodeBlockActive) {
      const codeBlockCount = (newValue.match(/```/g) || []).length;
      if (codeBlockCount % 2 === 1) {
        setIsCodeBlockActive(true);
        setOriginalCodeLanguage(match[2]);
        setCodeLanguage(match[2] || "text");
        onChange(newValue.replace(/(^|\n)```([^\n]*)\n$/, "$1"));
      } else {
        onChange(newValue);
      }
    } else {
      onChange(newValue);
    }
  };

  const isButtonActive =
    !disabled &&
    !isLoading &&
    (value.trim().length > 0 || codeValue.trim().length > 0);

  const containerContent = (
    <div
      className={`
        ${styles.container}
        ${disabled ? styles.disabled : ""}
        ${isExpandedLayout ? styles.expandedLayout : styles.standardLayout}
        ${variant === "transparent" ? styles.transparentVariant : ""} 
      `}
    >
      {showExpandBtn && isExpandedLayout && !isCodeBlockActive && (
        <div className={styles.expandButtonWrapper}>
          <button
            type="button"
            onClick={() => setIsManualExpanded(!isManualExpanded)}
            className={styles.expandButton}
            title={isManualExpanded ? "Collapse" : "Expand"}
          >
            {isManualExpanded ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        </div>
      )}

      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={`${styles.textarea} ${
          variant === "transparent" ? styles.textareaTransparent : ""
        }`}
        style={{ width: isExpandedLayout ? "calc(100% - 2rem)" : "100%" }}
      />

      {isCodeBlockActive && (
        <CodeBlock
          ref={codeTaRef}
          language={codeLanguage}
          value={codeValue}
          isEditable={true}
          onChange={setCodeValue}
          onKeyDown={handleCodeKeyDown}
          placeholder={`Enter ${codeLanguage} code... (3 newlines to exit)`}
        />
      )}

      <div
        className={`${styles.actions} ${
          isExpandedLayout ? styles.expanded : ""
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isButtonActive) onSend();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={!isButtonActive}
          title={isLoading ? "Thinking..." : "Send"}
          className={`${styles.sendButton} ${
            isButtonActive ? styles.active : styles.inactive
          }`}
        >
          <Send size={20} />
        </button>
      </div>

      {contextMenu.isOpen && (
        <ContextMenu
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

  if (variant === "transparent") {
    return containerContent;
  }

  return (
    <footer className={styles.footer}>
      <div className={styles.inputWrapper}>{containerContent}</div>

      <div className={styles.disclaimer}>
        <span>AI responses may include mistakes. </span>
        <a
          href="https://support.google.com/websearch?p=ai_overviews"
          className={styles.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn more
        </a>
      </div>
    </footer>
  );
};

export default ChatInput;
