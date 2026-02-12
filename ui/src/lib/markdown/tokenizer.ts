/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StreamSegment } from "./parser";

/**
 * Represents a single streamable token for animation.
 */
export interface StreamToken {
  segmentIndex: number;
  text: string;
  isFirst: boolean;
  isLast: boolean;
  /** Suggested delay in ms after revealing this token */
  delay: number;
}

/**
 * Delay configuration for different segment types.
 */
const DELAYS = {
  text: 25,
  bold: 25,
  italic: 25,
  heading: 20,
  listItem: 25,
  link: 25,
  blockquote: 25,
  code: 15, // Inline code
  codeblock: 3, // Code block lines are faster
  math: 0, // Inline math — atomic, no streaming
  mathblock: 0, // Display math — atomic, no streaming
  paragraph: 0,
  break: 0,
} as const;

/**
 * Converts parsed segments into streamable tokens.
 * Text is split by words, code blocks by lines.
 * Math segments are treated as atomic single tokens.
 */
export function tokenizeSegments(segments: StreamSegment[]): StreamToken[] {
  const tokens: StreamToken[] = [];

  segments.forEach((segment, segmentIndex) => {
    const baseDelay = DELAYS[segment.type] ?? 25;

    // Math segments are atomic — entire content is one token
    if (segment.type === "math" || segment.type === "mathblock") {
      if (segment.content.trim()) {
        tokens.push({
          segmentIndex,
          text: segment.content,
          isFirst: true,
          isLast: true,
          delay: 0,
        });
      }
      return;
    }

    if (segment.type === "codeblock") {
      // Split code blocks by line for faster streaming
      const lines = segment.content.split("\n");
      lines.forEach((line, i) => {
        tokens.push({
          segmentIndex,
          text: i < lines.length - 1 ? line + "\n" : line,
          isFirst: i === 0,
          isLast: i === lines.length - 1,
          delay: baseDelay,
        });
      });
    } else if (segment.type === "break") {
      // Breaks don't need tokens
      tokens.push({
        segmentIndex,
        text: "\n",
        isFirst: true,
        isLast: true,
        delay: 0,
      });
    } else if (segment.content.trim() === "") {
      // Whitespace-only segments (like paragraph breaks)
      if (segment.content) {
        tokens.push({
          segmentIndex,
          text: segment.content,
          isFirst: true,
          isLast: true,
          delay: 0,
        });
      }
    } else {
      // Split by words, preserving whitespace
      const words = segment.content.match(/\S+|\s+/g) || [segment.content];
      words.forEach((word, i) => {
        tokens.push({
          segmentIndex,
          text: word,
          isFirst: i === 0,
          isLast: i === words.length - 1,
          delay: word.trim() ? baseDelay : 0, // No delay for pure whitespace
        });
      });
    }
  });

  return tokens;
}
