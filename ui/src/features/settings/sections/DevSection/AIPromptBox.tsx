/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
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
    <path d="M10 4v6H4" />
    <path d="M14 20v-6h6" />
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const skillsDropdownRef = useRef<HTMLDivElement>(null);
  const keepProgressInfoRef = useRef<HTMLButtonElement>(null);

  const [showExpandButton, setShowExpandButton] = useState(false);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const lineHeight = 24;
      const maxLines = isExpanded ? 10 : 3;
      const maxHeight = lineHeight * maxLines;
      const scrollHeight = textarea.scrollHeight;

      setShowExpandButton(scrollHeight > lineHeight * 3);

      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [prompt, isExpanded]);

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
    if (prompt.trim()) {
      console.log("Submitting:", {
        prompt,
        model: selectedModel,
      });
      setPrompt("");
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

      {/* Prompt Input */}
      <textarea
        ref={textareaRef}
        className={styles.textarea}
        placeholder="Ask anything"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
      />

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

        {/* Submit Button */}
        <button
          className={`${styles.submitButton} ${prompt.trim() ? styles.submitActive : ""}`}
          onClick={handleSubmit}
          disabled={!prompt.trim()}
          aria-label="Submit"
        >
          <ArrowUp size={18} />
        </button>
      </div>
    </div>
  );
};
