/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { useCopyToClipboard, useCodeHighlighter } from "../../hooks";
import styles from "./CodeBlock.module.css";

interface CodeBlockViewerProps {
  language: string;
  value: string;
  stickyHeader?: boolean;
}

/**
 * Read-only code block with syntax highlighting.
 * Switched to CSS native sticky positioning for buttery smooth performance.
 */
export const CodeBlockViewer: React.FC<CodeBlockViewerProps> = ({
  language,
  value,
  stickyHeader = true,
}) => {
  const { isCopied, copy } = useCopyToClipboard(1000);
  const { highlightedHtml, isLoading } = useCodeHighlighter(value, language);

  const handleCopy = () => copy(value);

  return (
    <div className={styles.wrapper} role="region" aria-label="code block">
      <div className={`${styles.header} ${stickyHeader ? styles.sticky : ""}`}>
        <div className={styles.langLabel}>
          <Terminal size={14} />
          <span className={styles.langName}>{language || "text"}</span>
        </div>

        <button
          onClick={handleCopy}
          className={styles.copyButton}
          title="Copy code"
          aria-label="Copy code"
          data-copied={isCopied ? "true" : "false"}
        >
          <span className={styles.iconWrapper}>
            {isCopied ? <Check size={14} /> : <Copy size={14} />}
          </span>
          <span>Copy</span>
        </button>
      </div>

      <div className={styles.content}>
        {isLoading ? (
          <pre className={styles.pre}>{value}</pre>
        ) : language === "text" ? (
          <pre className={styles.pre}>{value}</pre>
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
