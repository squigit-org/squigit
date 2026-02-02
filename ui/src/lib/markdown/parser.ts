/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
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
 * Uses remark to generate an AST, then flattens it for streaming.
 */
export function parseMarkdownToSegments(markdown: string): StreamSegment[] {
  const processor = unified().use(remarkParse).use(remarkGfm);
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

    default:
      // For other node types, try to extract text
      if ("children" in node && Array.isArray(node.children)) {
        for (const child of node.children) {
          processNode(child as RootContent, segments);
        }
      } else if ("value" in node && typeof node.value === "string") {
        segments.push({ type: "text", content: node.value });
      }
  }
}

/**
 * Recursively extracts plain text from a node.
 */
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
