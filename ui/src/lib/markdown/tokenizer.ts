/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StreamSegment } from "./parser";

export interface StreamToken {
  segmentIndex: number;
  text: string;
  isFirst: boolean;
  isLast: boolean;
  delay: number;
}

const DELAYS = {
  text: 25,
  bold: 25,
  italic: 25,
  heading: 20,
  listItem: 25,
  link: 25,
  blockquote: 25,
  code: 15,
  codeblock: 3,
  math: 0,
  mathblock: 0,
  paragraph: 0,
  break: 0,
} as const;

export function tokenizeSegments(segments: StreamSegment[]): StreamToken[] {
  const tokens: StreamToken[] = [];

  segments.forEach((segment, segmentIndex) => {
    const baseDelay = DELAYS[segment.type] ?? 25;

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
      tokens.push({
        segmentIndex,
        text: "\n",
        isFirst: true,
        isLast: true,
        delay: 0,
      });
    } else if (segment.content.trim() === "") {
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
      const words = segment.content.match(/\S+|\s+/g) || [segment.content];
      words.forEach((word, i) => {
        tokens.push({
          segmentIndex,
          text: word,
          isFirst: i === 0,
          isLast: i === words.length - 1,
          delay: word.trim() ? baseDelay : 0,
        });
      });
    }
  });

  return tokens;
}
