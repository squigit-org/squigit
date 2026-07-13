/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { attachmentFromPath } from "./factory.ts";
import {
  getBaseName,
  isAttachmentPath,
  unwrapMarkdownLinkDestination,
  isAbsoluteCasPath,
} from "./paths.ts";

export const LINK_ATTACHMENT_MENTION_RE = /\[([^\]\n]+)\]\((<[^>\n]+>|[^)\n]+)\)/g;

function sanitizeAttachmentLabel(label: string): string {
  return label.replace(/[\[\]\n\r]/g, " ").trim();
}

function isFileLinkDestination(destination: string): boolean {
  const value = destination.trim();
  const unwrapped =
    value.startsWith("<") && value.endsWith(">")
      ? value.slice(1, -1).trim()
      : value;
  return unwrapped.toLowerCase().startsWith("file://");
}

export function isAttachmentLinkDestination(destination: string): boolean {
  const path = unwrapMarkdownLinkDestination(destination);
  return isFileLinkDestination(destination) && isAttachmentPath(path);
}

export function formatAttachmentLinkDestination(path: string): string {
  const value = unwrapMarkdownLinkDestination(path);
  const normalized = value.replace(/\\/g, "/");
  const encoded = encodeURI(normalized);
  if (/^[a-zA-Z]:\//.test(normalized)) return `file:///${encoded}`;
  if (normalized.startsWith("//")) return `file:${encoded}`;
  return `file://${normalized.startsWith("/") ? "" : "/"}${encoded}`;
}

export function isAbsoluteCasAttachmentMarkdownLink(
  label: string,
  destination: string,
): boolean {
  return Boolean(label.trim()) && isAbsoluteCasPath(destination);
}

export function normalizeAttachmentMarkdownLinks(text: string): string {
  return text.replace(
    LINK_ATTACHMENT_MENTION_RE,
    (full, label: string, rawDestination: string) => {
      const path = unwrapMarkdownLinkDestination(rawDestination);
      if (!isAttachmentLinkDestination(rawDestination)) {
        return full;
      }
      return buildAttachmentMention(path, label);
    },
  );
}

export function parseAttachmentPaths(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(LINK_ATTACHMENT_MENTION_RE)) {
    const path = unwrapMarkdownLinkDestination(String(match[2] || ""));
    if (
      !isAttachmentLinkDestination(String(match[2] || "")) ||
      seen.has(path)
    ) {
      continue;
    }
    seen.add(path);
    out.push(path);
  }

  return out;
}

export function stripAttachmentMentions(text: string): string {
  const withoutLinks = text.replace(
    LINK_ATTACHMENT_MENTION_RE,
    (full, _label, rawPath: string) => {
      return isAttachmentLinkDestination(rawPath) ? "" : full;
    },
  );
  return withoutLinks.replace(/\n{3,}/g, "\n\n").trim();
}

export function stripImageAttachmentMentions(text: string): string {
  const withoutImageLinks = text.replace(
    LINK_ATTACHMENT_MENTION_RE,
    (full, label: string, rawPath: string) => {
      const path = unwrapMarkdownLinkDestination(rawPath);
      if (!isAttachmentLinkDestination(rawPath)) {
        return full;
      }

      const attachment = attachmentFromPath(
        path,
        undefined,
        label || undefined,
      );
      return attachment.type === "image"
        ? ""
        : buildAttachmentMention(path, label);
    },
  );

  return withoutImageLinks.replace(/\n{3,}/g, "\n\n").trim();
}

export function buildAttachmentMention(
  path: string,
  displayName?: string,
): string {
  const fallbackName = getBaseName(path);
  const label = sanitizeAttachmentLabel(
    displayName || fallbackName || "attachment",
  );
  const destination = formatAttachmentLinkDestination(path);
  return `[${label}](${destination})`;
}
