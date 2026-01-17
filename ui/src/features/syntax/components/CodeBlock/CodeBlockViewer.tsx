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
}

/**
 * Read-only code block with syntax highlighting.
 * Uses Shiki for dual-theme syntax highlighting.
 */
export const CodeBlockViewer: React.FC<CodeBlockViewerProps> = ({
  language,
  value,
}) => {
  const { isCopied, copy } = useCopyToClipboard();
  const { highlightedHtml, isLoading } = useCodeHighlighter(value, language);

  const handleCopy = () => copy(value);

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.langLabel}>
          <Terminal size={14} />
          <span className={styles.langName}>{language || "text"}</span>
        </div>
        <button
          onClick={handleCopy}
          className={styles.copyButton}
          disabled={isCopied}
          title="Copy code"
        >
          {isCopied ? (
            <>
              <Check size={14} /> Copied
            </>
          ) : (
            <>
              <Copy size={14} /> Copy
            </>
          )}
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
