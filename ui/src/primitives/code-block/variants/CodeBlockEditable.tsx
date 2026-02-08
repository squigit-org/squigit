/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef } from "react";
import { Terminal } from "lucide-react";
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
      <textarea
        ref={ref}
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={5}
        aria-label="code editor"
      />
    </div>
  );
});

CodeBlockEditable.displayName = "CodeBlockEditable";
