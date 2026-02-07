/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useLayoutEffect, useRef, useState, useEffect } from "react";
import { CodeBlock } from "@/widgets";
import { TextContextMenu } from "@/shell";
import { useTextContextMenu } from "@/hooks";
import { Send } from "lucide-react";
import styles from "./ChatInput.module.css";
import { google } from "@/lib/config";
import { useTextEditor } from "@/hooks/useTextEditor";

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

  const codeTaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineHeightRef = useRef<number>(24);

  const [isManualExpanded, setIsManualExpanded] = useState(false);
  const [showExpandBtn, setShowExpandBtn] = useState(false);

  const [isCodeBlockActive, setIsCodeBlockActive] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState("");
  const [originalCodeLanguage, setOriginalCodeLanguage] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [consecutiveEnters, setConsecutiveEnters] = useState(0);

  const {
    ref: taRef,
    hasSelection,
    handleCopy,
    handleCut,
    handlePaste,
    handleSelectAll,
    handleKeyDown: handleEditorKeyDown,
  } = useTextEditor({
    value,
    onChange,
    onSubmit: () => {
      if (!disabled && !isLoading && value.trim().length > 0) onSend();
    },
  });

  const {
    data: contextMenu,
    handleContextMenu,
    handleClose: handleCloseContextMenu,
  } = useTextContextMenu({
    hasSelection,
  });

  const isExpandedLayout = value.includes("\n") || isCodeBlockActive;

  useEffect(() => {
    if (isCodeBlockActive) {
      codeTaRef.current?.focus();
    }
  }, [isCodeBlockActive]);

  const adjustHeight = React.useCallback(() => {
    const ta = taRef.current as HTMLTextAreaElement;
    if (!ta) return;

    const currentSelectionStart = ta.selectionStart;
    const currentSelectionEnd = ta.selectionEnd;
    const currentValue = ta.value;

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

    if (ta.value === currentValue && document.activeElement === ta) {
      requestAnimationFrame(() => {
        if (ta && ta.value === currentValue) {
          ta.setSelectionRange(currentSelectionStart, currentSelectionEnd);
        }
      });
    }
  }, [isManualExpanded, maxRows, taRef]);

  useLayoutEffect(() => {
    adjustHeight();
  }, [value, maxRows, isManualExpanded, isExpandedLayout, adjustHeight]);

  useEffect(() => {
    const ta = taRef.current as HTMLTextAreaElement;
    if (!ta) return;

    const observer = new ResizeObserver(() => {
      adjustHeight();
    });

    observer.observe(ta);

    return () => observer.disconnect();
  }, [adjustHeight, taRef]);

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
        const ta = taRef.current as HTMLTextAreaElement;
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
        setTimeout(() => (taRef.current as HTMLTextAreaElement)?.focus(), 0);
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
        ref={taRef as React.RefObject<HTMLTextAreaElement>}
        value={value}
        onChange={handleChange}
        onKeyDown={handleEditorKeyDown as any}
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

  if (variant === "transparent") {
    return containerContent;
  }

  return (
    <footer className={styles.footer}>
      <div className={styles.inputWrapper}>{containerContent}</div>

      <div className={styles.disclaimer}>
        <span>AI responses may include mistakes. </span>
        <a
          href={`${google.support}/websearch?p=ai_overviews`}
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
