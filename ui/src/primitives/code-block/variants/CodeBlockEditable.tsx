/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  forwardRef,
  useRef,
  useCallback,
  useImperativeHandle,
} from "react";
import { Terminal } from "lucide-react";
import { useCodeHighlighter } from "@/hooks";
import styles from "./CodeBlock.shared.module.css";

interface CodeBlockEditableProps {
  language: string;
  value: string;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
}

export const CodeBlockEditable = forwardRef<
  HTMLTextAreaElement,
  CodeBlockEditableProps
>(({ language, value, onChange, onKeyDown, placeholder }, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Expose the textarea ref to parent
  useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);

  // Only highlight if a valid language is provided (not "text")
  const shouldHighlight = language && language !== "text";
  const { highlightedHtml } = useCodeHighlighter(
    shouldHighlight ? value : "",
    language,
  );

  // Sync scroll between textarea and highlight overlay
  const handleScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Ensure trailing newline so cursor position matches
  const displayValue = value.endsWith("\n") ? value + " " : value;

  return (
    <div
      className={styles.wrapper}
      role="region"
      aria-label="editable code block"
    >
      <div className={styles.header}>
        <div className={styles.langLabel}>
          <Terminal size={14} />
          <span className={styles.langName}>{language || "text"}</span>
        </div>
      </div>
      <div className={styles.editableContainer}>
        {/* Highlighted code layer (behind) */}
        {shouldHighlight && highlightedHtml ? (
          <div
            ref={highlightRef}
            className={`${styles.highlightLayer} shiki-dual-theme`}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            aria-hidden="true"
          />
        ) : (
          <pre
            ref={highlightRef as any}
            className={styles.highlightLayer}
            aria-hidden="true"
          >
            {displayValue || placeholder}
          </pre>
        )}
        {/* Transparent textarea (on top) */}
        <textarea
          ref={textareaRef}
          className={styles.textareaOverlay}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={handleScroll}
          placeholder={placeholder}
          spellCheck={false}
          aria-label="code editor"
        />
      </div>
    </div>
  );
});

CodeBlockEditable.displayName = "CodeBlockEditable";
