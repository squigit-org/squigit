/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Check, Copy } from "lucide-react";
import { useCodeHighlighter, useCopyToClipboard } from "@/hooks";
import styles from "./shared.module.css";

interface CodeBlockViewerProps {
  language: string;
  value: string;
  stickyHeader?: boolean;
  /** When true, shows plain text with cursor (skips syntax highlighting) */
  isStreaming?: boolean;
}

export const CodeBlockViewer: React.FC<CodeBlockViewerProps> = ({
  language,
  value,
  stickyHeader = true,
  isStreaming = false,
}) => {
  const { isCopied, copy } = useCopyToClipboard(1000);
  // Skip highlighting during streaming for performance
  const { highlightedHtml, isLoading } = useCodeHighlighter(
    isStreaming ? "" : value,
    language,
  );

  const handleCopy = () => copy(value);

  // During streaming, show plain text with cursor
  const shouldShowPlain = isStreaming || isLoading || language === "text";

  return (
    <div className={styles.wrapper} role="region" aria-label="code block">
      <div className={styles.header}>
        <div className={styles.langLabel}>
          <span className={styles.langName}>{language || "text"}</span>
        </div>
      </div>

      <button
        onClick={handleCopy}
        className={`${styles.copyButton} ${stickyHeader ? styles.stickyButton : ""}`}
        title="Copy code"
        aria-label="Copy code"
        data-copied={isCopied ? "true" : "false"}
      >
        <span className={styles.iconWrapper}>
          {isCopied ? <Check size={14} /> : <Copy size={14} />}
        </span>
        <span>Copy</span>
      </button>

      <div className={styles.content}>
        {shouldShowPlain ? (
          <pre className={styles.pre}>
            {value}
            {isStreaming && <span className={styles.streamCursor}>▋</span>}
          </pre>
        ) : (
          <div
            className={`${styles.shikiContainer} shiki-dual-theme`}
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        )}
      </div>
    </div>
  );
};

CodeBlockViewer.displayName = "CodeBlockViewer";
