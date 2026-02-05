/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  parseMarkdownToSegments,
  tokenizeSegments,
  type StreamSegment,
  type StreamToken,
} from "@/lib/markdown";
import { CodeBlock } from "@/widgets";
import styles from "./StreamRenderer.module.css";

interface StreamRendererProps {
  fullText: string;
  onComplete?: () => void;
}

/**
 * Renders markdown with animated token-by-token reveal.
 * Parses the full text into segments, tokenizes for streaming,
 * and progressively reveals with proper styling.
 */
export const StreamRenderer: React.FC<StreamRendererProps> = ({
  fullText,
  onComplete,
}) => {
  const [revealedCount, setRevealedCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);

  // Keep callback ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Parse and tokenize the full text
  const { segments, tokens } = useMemo(() => {
    const segs = parseMarkdownToSegments(fullText);
    const toks = tokenizeSegments(segs);
    return { segments: segs, tokens: toks };
  }, [fullText]);

  // Animation loop
  useEffect(() => {
    if (isPaused || revealedCount >= tokens.length) {
      if (revealedCount >= tokens.length && onCompleteRef.current) {
        onCompleteRef.current();
      }
      return;
    }

    const currentToken = tokens[revealedCount];
    const delay = currentToken?.delay ?? 25;

    timeoutRef.current = window.setTimeout(() => {
      setRevealedCount((prev) => prev + 1);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [revealedCount, tokens, isPaused]);

  // Keyboard controls for accessibility
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setIsPaused((p) => !p);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setRevealedCount(tokens.length);
      }
    },
    [tokens.length],
  );

  // Group revealed tokens by segment for rendering
  const revealedSegments = useMemo(() => {
    const revealed = tokens.slice(0, revealedCount);
    const grouped = new Map<number, string[]>();

    revealed.forEach((token) => {
      if (!grouped.has(token.segmentIndex)) {
        grouped.set(token.segmentIndex, []);
      }
      grouped.get(token.segmentIndex)!.push(token.text);
    });

    return grouped;
  }, [tokens, revealedCount]);

  // Render a segment with its revealed content
  const renderSegment = (segment: StreamSegment, index: number) => {
    const revealedTexts = revealedSegments.get(index);
    if (!revealedTexts) return null;

    const content = revealedTexts.join("");
    const isComplete =
      tokens.filter((t) => t.segmentIndex === index && t.isLast).length > 0 &&
      revealedTexts.length ===
        tokens.filter((t) => t.segmentIndex === index).length;

    switch (segment.type) {
      case "text":
        return (
          <span key={index} className={styles.segment}>
            {content}
          </span>
        );

      case "bold":
        return (
          <strong key={index} className={styles.bold}>
            {content}
          </strong>
        );

      case "italic":
        return (
          <em key={index} className={styles.italic}>
            {content}
          </em>
        );

      case "code":
        return (
          <code key={index} className={styles.inlineCode}>
            {content}
          </code>
        );

      case "codeblock":
        return (
          <CodeBlock
            key={index}
            language={segment.meta?.language || ""}
            value={content}
            isStreaming={!isComplete}
          />
        );

      case "heading": {
        const level = segment.meta?.level || 1;
        const headingClass =
          styles[`heading${level}` as keyof typeof styles] || styles.heading1;
        return (
          <span
            key={index}
            className={headingClass}
            role="heading"
            aria-level={level}
          >
            {content}
          </span>
        );
      }

      case "listItem":
        return (
          <li key={index} className={styles.listItem}>
            {content}
          </li>
        );

      case "blockquote":
        return (
          <blockquote key={index} className={styles.blockquote}>
            {content}
          </blockquote>
        );

      case "link":
        return (
          <a
            key={index}
            href={segment.meta?.href}
            className={styles.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            {content}
          </a>
        );

      case "break":
        return <br key={index} />;

      default:
        return (
          <span key={index} className={styles.segment}>
            {content}
          </span>
        );
    }
  };

  const isComplete = revealedCount >= tokens.length;

  return (
    <div
      className={styles.container}
      role="region"
      aria-live="polite"
      aria-label="AI response"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {segments.map((segment, index) => renderSegment(segment, index))}
      {!isComplete && <span className={styles.cursor}>▋</span>}
    </div>
  );
};

StreamRenderer.displayName = "StreamRenderer";
