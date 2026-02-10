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
  label:
    m.id === "gemini-2.5-pro"
      ? "2.5 Pro"
      : m.id === "gemini-2.5-flash"
        ? "2.5 Flash"
        : "2.5 Lite",
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

  const placeholder = customPlaceholder || "Ask anything";
  const disabled = isLoading;

  const [selectedModel, setSelectedModel] = useState(GEMINI_MODELS[1].id);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showKeepProgressTooltip, setShowKeepProgressTooltip] = useState(false);

  // Code block state
  const [isCodeBlockActive, setIsCodeBlockActive] = useState(false);
  const [codeLanguage, setCodeLanguage] = useState("");
  const [originalCodeLanguage, setOriginalCodeLanguage] = useState("");
  const [codeValue, setCodeValue] = useState("");
  const [consecutiveEnters, setConsecutiveEnters] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shadowRef = useRef<HTMLTextAreaElement>(null);
  const codeTaRef = useRef<HTMLTextAreaElement>(null);
  const keepProgressInfoRef = useRef<HTMLButtonElement>(null);

  const [showExpandButton, setShowExpandButton] = useState(false);

  // Resize textarea using shadow ref logic to avoid layout thrashing
  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    const shadow = shadowRef.current;
    if (!textarea || !shadow) return;

    const lineHeight = 24;
    const maxLines = isExpanded ? 15 : 10;
    const maxHeight = lineHeight * maxLines;

    // Sync shadow width with real textarea (minus scrollbar)
    shadow.style.width = `${textarea.clientWidth}px`;

    // Reset shadow height to allow shrinking
    shadow.style.height = "0px";
    const scrollHeight = shadow.scrollHeight;

    // Set height on real textarea based on shadow measurement
    const newHeight = Math.min(scrollHeight, maxHeight);
    textarea.style.height = `${newHeight}px`;

    setShowExpandButton(isCodeBlockActive || scrollHeight > lineHeight * 10);

    // Prepare scroll position if needed
    if (document.activeElement === textarea) {
      if (textarea.scrollHeight > textarea.clientHeight) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    }
  }, [isExpanded, isCodeBlockActive]);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [value, isExpanded, resizeTextarea]);

  // Focus code block when activated
  useEffect(() => {
    if (isCodeBlockActive) {
      codeTaRef.current?.focus();
    }
  }, [isCodeBlockActive]);

  // Handle triple-backtick detection for code block activation
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;

    // Check if text before cursor ends with ```lang\n
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

  // Handle code block keyboard events (Escape to cancel, 3 Enters to commit)
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

  useEffect(() => {
    // No-op for now, retained if other global click handlers are needed
  }, []);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const selectedModelLabel =
    GEMINI_MODELS.find((m) => m.id === selectedModel)?.label || "Auto";

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
      {/* Top Row: Expand */}
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

      {/* Shadow Textarea for measurement */}
      <textarea
        ref={shadowRef}
        className={`${styles.textarea} ${styles.shadow}`}
        value={value}
        readOnly
        aria-hidden="true"
        tabIndex={-1}
        rows={1}
      />

      {/* Prompt Input */}
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        placeholder={isCodeBlockActive ? "" : placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={1}
        style={{ display: isCodeBlockActive ? "none" : undefined }}
      />

      {/* Code Block Editor */}
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

      {/* Bottom Actions */}
      <div className={styles.actions}>
        <div className={styles.leftActions}>
          {/* Attach File */}
          <button className={styles.iconButton} aria-label="Attach file">
            <Paperclip size={18} />
          </button>

          {/* Model Dropdown - Opens Up */}
          {/* Model Dropdown - Opens Up */}
          <Dropdown label={selectedModelLabel} direction="up" width={180}>
            <DropdownSectionTitle>Model</DropdownSectionTitle>
            {GEMINI_MODELS.map((model) => (
              <DropdownItem
                key={model.id}
                label={model.label}
                isActive={model.id === selectedModel}
                onClick={() => setSelectedModel(model.id)}
              />
            ))}
          </Dropdown>

          {/* Keep Progress Button + Info Tooltip */}
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
        </div>

        <div className={styles.rightActions}>
          {/* Voice Input */}
          <VoiceInput
            onTranscript={(text, isFinal) => {
              if (isFinal) {
                onChange((value + " " + text).trim());
              }
            }}
            disabled={disabled}
          />

          {/* Submit Button */}
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
