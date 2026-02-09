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
import {
  Paperclip,
  ArrowUp,
  Camera,
  ChevronUp,
  Check,
  Bot,
  Info,
} from "lucide-react";
import { MODELS } from "@/lib/config/models";
import { Tooltip } from "@/primitives/tooltip/Tooltip";
import { CodeBlock } from "@/primitives";
import { VoiceInput } from "@/features/chat/components/VoiceInput/VoiceInput";
import styles from "./AIPromptBox.module.css";

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

const SKILLS = [
  {
    id: "agent",
    label: "AI Agent",
    icon: <Bot size={16} />,
    description: "Let AI take control",
  },
];

export const AIPromptBox: React.FC = () => {
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState(GEMINI_MODELS[1].id);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
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
  const modelDropdownRef = useRef<HTMLDivElement>(null);
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

    setShowExpandButton(scrollHeight > lineHeight * 10);

    // Prepare scroll position if needed (but don't force it here to avoid jump)
    if (document.activeElement === textarea) {
      // Only scroll if we are near bottom or typing adds lines
      // For now, let's keep it simple: if height changes, browser handles caret visibility
      // If we need forced scroll:
      if (textarea.scrollHeight > textarea.clientHeight) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    }
  }, [isExpanded]);

  // useLayoutEffect: runs synchronously after DOM mutations, before browser paint
  // This prevents ghost carets because height adjustments happen in the "hidden" phase
  useLayoutEffect(() => {
    resizeTextarea();
  }, [prompt, isExpanded, resizeTextarea]);

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
      // Count all triple-backticks in the entire text to check if this opens a new block
      const codeBlockCount = (newValue.match(/```/g) || []).length;
      if (codeBlockCount % 2 === 1) {
        setIsCodeBlockActive(true);
        setOriginalCodeLanguage(match[2]);
        setCodeLanguage(match[2] || "text");
        // Remove the ``` from the text (the part before cursor minus the backticks)
        const beforeBackticks = textBeforeCursor.replace(
          /(^|\n)```([^\n]*)\n$/,
          "$1",
        );
        const afterCursor = newValue.slice(cursorPos);
        setPrompt(beforeBackticks + afterCursor);
      } else {
        setPrompt(newValue);
      }
    } else {
      setPrompt(newValue);
    }
  };

  // Handle code block keyboard events (Escape to cancel, 3 Enters to commit)
  const handleCodeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setIsCodeBlockActive(false);
      setPrompt(`${prompt}\`\`\`${originalCodeLanguage}\n`);
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
        const newPrompt = `${prompt}\n\`\`\`${codeLanguage}\n${codeValue.trim()}\n\`\`\`\n`;
        setPrompt(newPrompt);
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
    const handleClickOutside = (e: MouseEvent) => {
      if (
        modelDropdownRef.current &&
        !modelDropdownRef.current.contains(e.target as Node)
      ) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = () => {
    if (prompt.trim() || codeValue.trim()) {
      console.log("Submitting:", {
        prompt,
        codeValue,
        model: selectedModel,
      });
      setPrompt("");
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

  return (
    <div className={styles.container}>
      {/* Top Row: Skills + Expand */}
      <div className={styles.topRow}>
        {/* Expand/Collapse Button - only visible when needed */}
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
        value={prompt}
        readOnly
        aria-hidden="true"
        tabIndex={-1}
        rows={1}
      />

      {/* Prompt Input */}
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        placeholder={isCodeBlockActive ? "" : "Ask anything"}
        value={prompt}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
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
          <div className={styles.dropdownWrapper} ref={modelDropdownRef}>
            <button
              className={`${styles.toggleItem} ${modelDropdownOpen ? styles.toggleActive : ""}`}
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
            >
              <span>{selectedModelLabel}</span>
              <ChevronUp
                size={14}
                className={`${styles.chevron} ${modelDropdownOpen ? styles.chevronRotate : ""}`}
              />
            </button>

            <div
              className={`${styles.dropdown} ${styles.dropdownUp} ${modelDropdownOpen ? styles.dropdownOpen : ""}`}
            >
              <div className={styles.sectionTitle}>Model</div>
              {GEMINI_MODELS.map((model) => (
                <button
                  key={model.id}
                  className={`${styles.dropdownItem} ${model.id === selectedModel ? styles.itemActive : ""}`}
                  onClick={() => {
                    setSelectedModel(model.id);
                    setModelDropdownOpen(false);
                  }}
                >
                  <span>{model.label}</span>
                  {model.id === selectedModel && (
                    <Check size={14} className={styles.checkIcon} />
                  )}
                </button>
              ))}
            </div>
          </div>

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
                setPrompt((prev) => (prev + " " + text).trim());
              }
            }}
            disabled={false}
          />

          {/* Submit Button */}
          <button
            className={`${styles.submitButton} ${prompt.trim() || codeValue.trim() ? styles.submitActive : ""}`}
            onClick={handleSubmit}
            disabled={!(prompt.trim() || codeValue.trim())}
            aria-label="Submit"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};
