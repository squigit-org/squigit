/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { Paperclip, ArrowUp, Camera } from "lucide-react";
import { MODELS } from "@/lib/config/models";
import { Tooltip } from "@/primitives/tooltip/Tooltip";
import { useTextEditor, useTextContextMenu } from "@/hooks";
import { TextContextMenu } from "@/shell";
import { CodeBlock } from "@/primitives";
import {
  Dropdown,
  DropdownItem,
  DropdownSectionTitle,
} from "@/primitives/dropdown";
import { VoiceInput } from "../VoiceInput/VoiceInput";
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
    <path d="M8 2v6H2" />
    <path d="M16 22v-6h6" />
  </svg>
);

const GEMINI_MODELS = MODELS.map((m) => ({
  id: m.id,
  label: m.name,
  triggerLabel: m.name.replace("Gemini ", ""),
}));

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
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  startupImage,
  input: value,
  onInputChange: onChange,
  onSend,
  isLoading,
  placeholder: customPlaceholder,
  variant = "default",
  selectedModel,
  onModelChange,
}) => {
  if (!startupImage) return null;

  const placeholder = customPlaceholder || "Ask anything";
  const disabled = isLoading;

  const [isExpanded, setIsExpanded] = useState(false);

  const [showFileButtonTooltip, setShowFileButtonTooltip] = useState(false);
  const [showKeepProgressTooltip, setShowKeepProgressTooltip] = useState(false);

  const [isCodeBlockActive, setIsCodeBlockActive] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState("");
  const [originalCodeLanguage, setOriginalCodeLanguage] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [consecutiveEnters, setConsecutiveEnters] = useState(0);

  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shadowRef = useRef<HTMLTextAreaElement>(null);
  const codeTaRef = useRef<HTMLTextAreaElement>(null);
  const fileButtonRef = useRef<HTMLButtonElement>(null);
  const keepProgressInfoRef = useRef<HTMLButtonElement>(null);

  const [showExpandButton, setShowExpandButton] = useState(false);

  const handleModelSelect = useCallback(
    (id: string) => {
      onModelChange(id);
      setAiMenuOpen(false);
    },
    [onModelChange],
  );

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    const shadow = shadowRef.current;
    if (!textarea || !shadow) return;

    shadow.value = value;

    const lineHeight = 24;
    const maxLines = isExpanded ? 15 : 10;
    const maxHeight = lineHeight * maxLines;

    const width =
      textarea.getBoundingClientRect().width || textarea.clientWidth;
    shadow.style.width = `${width}px`;

    shadow.style.height = "0px";
    const scrollHeight = shadow.scrollHeight;

    const minHeight = 32;
    const newHeight = Math.max(Math.min(scrollHeight, maxHeight), minHeight);
    textarea.style.height = `${newHeight}px`;

    setShowExpandButton(isCodeBlockActive || scrollHeight > lineHeight * 10);

    if (document.activeElement === textarea) {
      if (textarea.scrollHeight > textarea.clientHeight) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    }
  }, [value, isExpanded, isCodeBlockActive]);

  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => resizeTextarea());
    return () => cancelAnimationFrame(raf);
  }, [value, isExpanded, resizeTextarea]);

  useEffect(() => {
    if (isCodeBlockActive) {
      codeTaRef.current?.focus();
    }
  }, [isCodeBlockActive]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;

    const textBeforeCursor = newValue.slice(0, cursorPos);
    const match = textBeforeCursor.match(/(^|\n)```([^\n]*)\n$/);

    if (match && !isCodeBlockActive) {
      const codeBlockCount = (newValue.match(/```/g) || []).length;
      if (codeBlockCount % 2 === 1) {
        setIsCodeBlockActive(true);
        setOriginalCodeLanguage(match[2]);
        setCodeLanguage(match[2] || "text");
        const beforeBackticks = textBeforeCursor.replace(
          /(^|\n)```([^\n]*)\n$/,
          "$1",
        );
        const afterCursor = newValue.slice(cursorPos);
        onChange(beforeBackticks + afterCursor);
      } else {
        onChange(newValue);
      }
    } else {
      onChange(newValue);
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
        const ta = textareaRef.current;
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
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    } else {
      setConsecutiveEnters(0);
    }
  };

  useEffect(() => {}, []);

  const handleSubmit = () => {
    if (
      !disabled &&
      !isLoading &&
      (value.trim().length > 0 || codeValue.trim().length > 0)
    ) {
      onSend();
      setCodeValue("");
      setIsCodeBlockActive(false);
    }
  };

  const {
    ref: editorRef,
    handleKeyDown: editorKeyDown,
    hasSelection,
    handleCopy,
    handleCut,
    handlePaste,
    handleSelectAll,
    undo,
    redo,
  } = useTextEditor({
    value,
    onChange: (newValue) => {
      onChange(newValue);
    },
    onSubmit: handleSubmit,
    preventNewLine: false,
  });

  useLayoutEffect(() => {
    if (editorRef.current) {
      // @ts-ignore
      textareaRef.current = editorRef.current;
    }
  }, [editorRef.current]);

  const {
    data: contextMenuData,
    handleContextMenu,
    handleClose: handleCloseContextMenu,
  } = useTextContextMenu();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    editorKeyDown(e);
  };

  const selectedModelLabel =
    GEMINI_MODELS.find((m) => m.id === selectedModel)?.triggerLabel || "Auto";

  const isButtonActive =
    !disabled &&
    !isLoading &&
    (value.trim().length > 0 || codeValue.trim().length > 0);

  const containerContent = (
    <div
      className={`${styles.container} ${disabled ? styles.disabled : ""} ${
        variant === "transparent" ? styles.transparentVariant : ""
      }`}
    >
      <div className={styles.topRow}>
        {showExpandButton && (
          <button
            className={styles.expandButton}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        )}
      </div>

      <div className={styles.inputArea}>
        {!isCodeBlockActive && value.length === 0 && (
          <div className={styles.customPlaceholder}>{placeholder}</div>
        )}
        <textarea
          ref={shadowRef}
          className={`${styles.textarea} ${styles.shadow}`}
          value={value}
          readOnly
          aria-hidden="true"
          tabIndex={-1}
          rows={1}
        />

        <textarea
          ref={(el) => {
            // @ts-ignore
            editorRef.current = el;
            // @ts-ignore
            textareaRef.current = el;
          }}
          className={styles.textarea}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          style={{ display: isCodeBlockActive ? "none" : undefined }}
          onContextMenu={handleContextMenu}
        />
      </div>
      {contextMenuData.isOpen && !isCodeBlockActive && (
        <TextContextMenu
          x={contextMenuData.x}
          y={contextMenuData.y}
          onClose={handleCloseContextMenu}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onSelectAll={handleSelectAll}
          onUndo={undo}
          onRedo={redo}
          hasSelection={hasSelection}
        />
      )}

      {isCodeBlockActive && (
        <CodeBlock
          ref={codeTaRef}
          language={codeLanguage}
          value={codeValue}
          isEditable={true}
          onChange={setCodeValue}
          onKeyDown={handleCodeKeyDown}
          placeholder={`Enter ${codeLanguage} code... (3 newlines to exit)`}
          style={{
            height: isExpanded ? "360px" : "auto",
            maxHeight: isExpanded ? "360px" : "240px",
          }}
        />
      )}

      <div className={styles.actions}>
        <div className={styles.leftActions}>
          <button
            className={styles.iconButton}
            aria-label="Attach file"
            ref={fileButtonRef}
            onMouseEnter={() => setShowFileButtonTooltip(true)}
            onMouseLeave={() => setShowFileButtonTooltip(false)}
          >
            <Paperclip size={18} />
          </button>
          <Tooltip
            text="Add photos & files"
            parentRef={fileButtonRef}
            show={showFileButtonTooltip}
            above
          />

          <div className={styles.keepProgressGroup}>
            <button
              className={styles.toggleItem}
              aria-label="Keep Progress"
              ref={keepProgressInfoRef}
              onMouseEnter={() => setShowKeepProgressTooltip(true)}
              onMouseLeave={() => setShowKeepProgressTooltip(false)}
            >
              <Camera size={16} />
              <span>Keep Progress</span>
            </button>
            <Tooltip
              text="Bring your screen directly to the chat"
              parentRef={keepProgressInfoRef}
              show={showKeepProgressTooltip}
              above
            />
          </div>

          <Dropdown
            label={selectedModelLabel}
            direction="up"
            isOpen={aiMenuOpen}
            onOpenChange={setAiMenuOpen}
            width={180}
            align="left"
          >
            <DropdownSectionTitle>Model</DropdownSectionTitle>
            {GEMINI_MODELS.map((model) => (
              <div
                style={{
                  marginTop: "2px",
                }}
              >
                <DropdownItem
                  key={model.id}
                  label={model.label}
                  isActive={model.id === selectedModel}
                  onClick={() => handleModelSelect(model.id)}
                />
              </div>
            ))}
          </Dropdown>
        </div>

        <div className={styles.rightActions}>
          <VoiceInput
            onTranscript={(text, isFinal) => {
              if (isFinal) {
                onChange((value + " " + text).trim());
              }
            }}
            disabled={disabled}
          />

          <button
            className={`${styles.submitButton} ${isButtonActive ? styles.submitActive : ""}`}
            onClick={handleSubmit}
            disabled={!isButtonActive}
            aria-label="Submit"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  if (variant === "transparent") {
    return containerContent;
  }

  return (
    <footer className={styles.footer}>
      <div className={styles.inputWrapper}>{containerContent}</div>
    </footer>
  );
};

export default ChatInput;
