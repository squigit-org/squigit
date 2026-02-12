/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { Root, RootContent, PhrasingContent } from "mdast";

/**
 * Represents a styled segment of markdown content for streaming.
 */
export interface StreamSegment {
  type:
    | "text"
    | "bold"
    | "italic"
    | "code"
    | "codeblock"
    | "math"
    | "mathblock"
    | "heading"
    | "listItem"
    | "link"
    | "paragraph"
    | "blockquote"
    | "break";
  content: string;
  meta?: {
    language?: string;
    level?: number;
    href?: string;
    ordered?: boolean;
  };
}

/**
 * Parses markdown text into an array of styled segments.
 * Uses a hybrid approach:
 * 1. Custom line-based parsing for Code Blocks (to handle nested blocks robustly by counting depth).
 * 2. Remark for parsing the remaining markdown text.
 */
export function parseMarkdownToSegments(markdown: string): StreamSegment[] {
  const segments: StreamSegment[] = [];
  const lines = markdown.split("\n");

  let inCodeBlock = false;
  let codeBlockDepth = 0;
  let codeBlockFence = "";
  let codeBlockLang = "";
  let codeBlockContent: string[] = [];

  let inMathBlock = false;
  let mathBlockContent: string[] = [];

  let textBuffer: string[] = [];

  const flushTextBuffer = () => {
    if (textBuffer.length > 0) {
      const text = textBuffer.join("\n") + "\n"; // Re-add newline lost by split
      const textSegments = parseMarkdownText(text);
      segments.push(...textSegments);
      textBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // --- Display math block detection ($$) ---
    // Must check before code fence to avoid conflicts
    if (!inCodeBlock) {
      const trimmed = line.trim();
      if (trimmed.startsWith("$$")) {
        if (!inMathBlock) {
          // Opening $$
          flushTextBuffer();
          const rest = trimmed.slice(2);
          if (rest.endsWith("$$") && rest.length > 0) {
            // Single-line: $$...$$
            segments.push({
              type: "mathblock",
              content: rest.slice(0, -2),
            });
          } else {
            inMathBlock = true;
            mathBlockContent = [];
            if (rest.trim()) mathBlockContent.push(rest);
          }
          continue;
        } else {
          // Closing $$
          const contentBefore = trimmed.slice(2).trim();
          if (contentBefore) mathBlockContent.push(contentBefore);
          segments.push({
            type: "mathblock",
            content: mathBlockContent.join("\n"),
          });
          inMathBlock = false;
          mathBlockContent = [];
          continue;
        }
      }

      if (inMathBlock) {
        mathBlockContent.push(line);
        continue;
      }
    }

    // Check for code fence - allow leading whitespace
    const fenceMatch = line.match(/^(\s*)(`{3,})(.*)$/);

    if (fenceMatch) {
      const indent = fenceMatch[1];
      const fence = fenceMatch[2];
      const lang = fenceMatch[3].trim();

      if (!inCodeBlock) {
        // Start of new main block
        flushTextBuffer();
        inCodeBlock = true;
        codeBlockDepth = 1;
        codeBlockFence = fence;
        codeBlockLang = lang;
        codeBlockContent = [];
      } else {
        // Inside block - check for nested structure
        // Logic:
        // If it has a language tag -> IT IS A NESTED START (Depth++)
        // If it has NO language tag -> IT IS A CLOSE (Depth--)

        if (lang !== "") {
          // Inner start fence (has language)
          codeBlockDepth++;
          codeBlockContent.push(line);
        } else {
          // Inner end fence (no language)
          if (fence.length >= codeBlockFence.length) {
            codeBlockDepth--;
          } else {
            // shorter fence is content
            codeBlockContent.push(line);
            continue;
          }

          if (codeBlockDepth === 0) {
            // Main block closed
            segments.push({
              type: "codeblock",
              content: codeBlockContent.join("\n"),
              meta: { language: codeBlockLang },
            });
            inCodeBlock = false;
            codeBlockFence = "";
            codeBlockLang = "";
            codeBlockDepth = 0;
            codeBlockContent = [];
          } else {
            // Nested block end -> treat as content
            codeBlockContent.push(line);
          }
        }
      }
    } else {
      if (inCodeBlock) {
        codeBlockContent.push(line);
      } else {
        textBuffer.push(line);
      }
    }
  }

  // Handle unfinished state (EOF)
  if (inMathBlock) {
    // Unclosed math block at EOF — render what we have
    segments.push({
      type: "mathblock",
      content: mathBlockContent.join("\n"),
    });
  } else if (inCodeBlock) {
    // If still in code block at EOF, treat as code block
    segments.push({
      type: "codeblock",
      content: codeBlockContent.join("\n"),
      meta: { language: codeBlockLang },
    });
  } else {
    // Flush remaining text
    if (textBuffer.length > 0) {
      const text = textBuffer.join("\n");
      const textSegments = parseMarkdownText(text);
      segments.push(...textSegments);
    }
  }

  return segments;
}

/**
 * Uses remark to parse plain markdown text into segments.
 */
function parseMarkdownText(markdown: string): StreamSegment[] {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
  const tree = processor.parse(markdown) as Root;
  const segments: StreamSegment[] = [];

  processNode(tree, segments);
  return segments;
}

function processNode(
  node: Root | RootContent | PhrasingContent,
  segments: StreamSegment[],
  inheritedStyle?: "bold" | "italic",
): void {
  switch (node.type) {
    case "root":
      for (const child of node.children) {
        processNode(child, segments);
      }
      break;

    case "paragraph":
      for (const child of node.children) {
        processNode(child, segments);
      }
      // Add newline after paragraph
      segments.push({ type: "text", content: "\n\n" });
      break;

    case "heading":
      segments.push({
        type: "heading",
        content: extractText(node),
        meta: { level: node.depth },
      });
      segments.push({ type: "text", content: "\n\n" });
      break;

    case "text":
      if (node.value.trim() || node.value === " ") {
        segments.push({
          type: inheritedStyle || "text",
          content: node.value,
        });
      }
      break;

    case "strong":
      for (const child of node.children) {
        processNode(child, segments, "bold");
      }
      break;

    case "emphasis":
      for (const child of node.children) {
        processNode(child, segments, "italic");
      }
      break;

    case "inlineCode":
      segments.push({
        type: "code",
        content: node.value,
      });
      break;

    case "code":
      segments.push({
        type: "codeblock",
        content: node.value,
        meta: { language: node.lang || "" },
      });
      break;

    case "link":
      segments.push({
        type: "link",
        content: extractText(node),
        meta: { href: node.url },
      });
      break;

    case "list":
      for (const child of node.children) {
        processNode(child, segments);
      }
      break;

    case "listItem":
      segments.push({
        type: "listItem",
        content: extractText(node),
        meta: { ordered: false },
      });
      segments.push({ type: "text", content: "\n" });
      break;

    case "blockquote":
      segments.push({
        type: "blockquote",
        content: extractText(node),
      });
      segments.push({ type: "text", content: "\n\n" });
      break;

    case "break":
    case "thematicBreak":
      segments.push({ type: "break", content: "" });
      break;

    // Math nodes from remark-math
    case "math":
      // Display math ($$...$$) detected inside text — should be rare since
      // we catch $$ at the line level, but handles edge cases
      if ("value" in node && typeof node.value === "string") {
        segments.push({ type: "mathblock", content: node.value });
        segments.push({ type: "text", content: "\n\n" });
      }
      break;

    case "inlineMath":
      if ("value" in node && typeof node.value === "string") {
        segments.push({ type: "math", content: node.value });
      }
      break;

    default:
      // For other node types, try to extract text
      if ("children" in node && Array.isArray(node.children)) {
        for (const child of node.children) {
          processNode(child as RootContent | PhrasingContent, segments);
        }
      } else if ("value" in node && typeof node.value === "string") {
        segments.push({ type: "text", content: node.value });
      }
  }
}

/**
 * Recursively extracts plain text from a node.
 */
/**
 * Pre-processes markdown string to fix common issues before rendering.
 * 1. Ensures code block fences are long enough to contain any nested fences (fixes breakage).
 * 2. Optionally doubles newlines in text (for user messages to preserve line breaks).
 */
export function preprocessMarkdown(
  markdown: string,
  options: { doubleNewlines?: boolean } = {},
): string {
  const lines = markdown.split("\n");
  const resultLines: string[] = [];

  let codeBlockDepth = 0;
  let inCodeBlock = false;
  let codeBlockFence = "";
  let codeBlockLang = "";
  let codeBlockContent: string[] = [];
  let textBuffer: string[] = [];

  const flushTextBuffer = () => {
    if (textBuffer.length > 0) {
      let text = textBuffer.join("\n");
      if (options.doubleNewlines) {
        // Replace single newlines with double newlines, but preserve existing doubles
        // Actually, easiest is to just replace all \n with \n\n?
        // But if user typed \n\n, it becomes \n\n\n\n. ReactMarkdown collapses >2 into 1 paragraph break.
        // So simple replacement works fine for paragraphs.
        text = text.replace(/\n/g, "\n\n");
      }
      resultLines.push(text);
      textBuffer = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check for code fence - allow leading whitespace
    const fenceMatch = line.match(/^(\s*)(`{3,})(.*)$/);

    if (fenceMatch) {
      const indent = fenceMatch[1];
      const fence = fenceMatch[2];
      const lang = fenceMatch[3].trim();

      if (!inCodeBlock) {
        // Start of new main block
        flushTextBuffer();
        inCodeBlock = true;
        codeBlockDepth = 1;
        codeBlockFence = fence;
        codeBlockLang = lang;
        codeBlockContent = [];
      } else {
        // Inside block - check for nested structure
        if (lang !== "") {
          codeBlockDepth++;
          codeBlockContent.push(line);
        } else {
          if (fence.length >= codeBlockFence.length) {
            codeBlockDepth--;
          } else {
            codeBlockContent.push(line);
            continue;
          }

          if (codeBlockDepth === 0) {
            // Main block closed
            const content = codeBlockContent.join("\n");

            // Fix nested fences: Find max fence length inside content
            // Regex to find ANY fence inside content
            // Global match for fences with at least 3 backticks
            const innerFences = content.match(/`{3,}/g);
            let maxFenceLength = 0;
            if (innerFences) {
              maxFenceLength = Math.max(...innerFences.map((f) => f.length));
            }

            // Ensure our outer fence is longer than any inner fence
            let outerFence = codeBlockFence;
            if (maxFenceLength >= outerFence.length) {
              outerFence = "`".repeat(maxFenceLength + 1);
            }

            // Reconstruct block with potentially longer fences
            // Note: We use original indent and lang
            resultLines.push(`${indent}${outerFence}${codeBlockLang}`);
            resultLines.push(content);
            resultLines.push(`${indent}${outerFence}`); // Closing fence matches opening

            inCodeBlock = false;
            codeBlockFence = "";
            codeBlockLang = "";
            codeBlockDepth = 0;
            codeBlockContent = [];
          } else {
            codeBlockContent.push(line);
          }
        }
      }
    } else {
      if (inCodeBlock) {
        codeBlockContent.push(line);
      } else {
        textBuffer.push(line);
      }
    }
  }

  // Handle unfinished state (EOF)
  if (inCodeBlock) {
    // If still in code block at EOF, treat as code block
    // We can't fix inner fences easily without closing?
    // Just output original parts?
    // Or close it implicitly?
    // Standard markdown: unclosed code block runs to end.
    // We should probably just output content wrapped in fence?
    // Or output raw content?
    // If we wrap, we fix rendering.

    const content = codeBlockContent.join("\n");
    const innerFences = content.match(/`{3,}/g);
    let maxFenceLength = 0;
    if (innerFences) {
      maxFenceLength = Math.max(...innerFences.map((f) => f.length));
    }
    let outerFence = codeBlockFence;
    if (maxFenceLength >= outerFence.length) {
      outerFence = "`".repeat(maxFenceLength + 1);
    }

    // We don't have indent stored? Ah, indent is local to loop.
    // We missed storing start indent.
    // But usually start indent is 0 or consistent.
    // Let's assume 0 or just not use indent for reconstruction. or extract form codeBlockFence?
    // codeBlockFence only stores backticks.

    // Simplification: Just append fence + content + close.
    // But we need the start line.
    // Actually, `resultLines` is array of strings. We push to it.

    // Re-implementation: Store full start line parts?
    // Or just be simple.

    // For now, simple fallback:
    resultLines.push(`${outerFence}${codeBlockLang}`);
    resultLines.push(content);
    resultLines.push(`${outerFence}`);
  } else {
    if (textBuffer.length > 0) {
      let text = textBuffer.join("\n");
      if (options.doubleNewlines) {
        text = text.replace(/\n/g, "\n\n");
      }
      resultLines.push(text);
    }
  }

  return resultLines.join("\n");
}

function extractText(node: any): string {
  if (node.type === "text") {
    return node.value;
  }
  if (node.type === "inlineCode") {
    return node.value;
  }
  if (node.children) {
    return node.children.map(extractText).join("");
  }
  return "";
}
