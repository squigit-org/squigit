/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from "react";
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
 * Uses Lerp-smoothed JS sticky positioning to wipe CPU jitter.
 */
export const CodeBlockViewer: React.FC<CodeBlockViewerProps> = ({
  language,
  value,
  stickyHeader = true,
}) => {
  const { isCopied, copy } = useCopyToClipboard(1000);
  const { highlightedHtml, isLoading } = useCodeHighlighter(value, language);

  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // We track the *current* visual position to smooth the transition
  const currentTopRef = useRef(0);

  const STICKY_THRESHOLD = 114;
  // 0.8 = "Snappy but smooth". Lower this (e.g. 0.5) if it still feels jittery.
  // Higher (0.95) makes it more rigid.
  const LERP_FACTOR = 0.8;

  useEffect(() => {
    if (!stickyHeader) {
      if (headerRef.current) {
        headerRef.current.style.top = "0px";
        headerRef.current.style.position = "relative";
      }
      return;
    }

    let rafId: number;

    const calculateSmoothPhysics = () => {
      if (!containerRef.current || !headerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const headerHeight = headerRef.current.offsetHeight;

      // 1. CALCULATE TARGET
      const rawOffset = STICKY_THRESHOLD - rect.top;
      const maxOffset = rect.height - headerHeight;
      const targetTop = Math.max(0, Math.min(rawOffset, maxOffset));

      // 2. SMOOTH IT (The "Quadratic" Wiping)
      // Instead of jumping straight to targetTop, we slide 80% of the way there.
      // This filters out the "80 30 90" spikes from the touchpad.
      const currentTop = currentTopRef.current;
      const nextTop = currentTop + (targetTop - currentTop) * LERP_FACTOR;

      // 3. SNAP if close (prevents endless micro-decimals)
      if (Math.abs(nextTop - targetTop) < 0.5) {
        currentTopRef.current = targetTop;
      } else {
        currentTopRef.current = nextTop;
      }

      // 4. APPLY
      headerRef.current.style.top = `${currentTopRef.current}px`;

      rafId = requestAnimationFrame(calculateSmoothPhysics);
    };

    rafId = requestAnimationFrame(calculateSmoothPhysics);

    return () => cancelAnimationFrame(rafId);
  }, [stickyHeader]);

  const handleCopy = () => copy(value);

  return (
    <div
      ref={containerRef}
      className={styles.wrapper}
      role="region"
      aria-label="code block"
    >
      <div
        ref={headerRef}
        className={styles.header}
        // will-change: top hints the browser to optimize this layer for movement
        style={{ position: "relative", zIndex: 5, willChange: "top" }}
      >
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
