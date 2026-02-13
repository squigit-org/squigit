/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatMetadata } from "@/lib/storage";
import type { Message } from "@/features/chat/types/chat.types";

// ── Types ──

export interface SystemChat {
  metadata: ChatMetadata;
  messages: Message[];
  /** Return true when this chat should appear in the panel */
  shouldShow: (ctx: SystemChatContext) => boolean;
}

export interface SystemChatContext {
  /** True when no profile is active (first launch or logged out) */
  isGuest: boolean;
  /** True when user has not yet agreed to the terms */
  hasNotAgreed: boolean;
  /** Currently running app version */
  currentVersion: string;
  /** Pending update info, if any */
  pendingUpdate: { version: string; notes: string } | null;
  /** Current OS type for platform-specific instructions */
  osType: string;
}

// ── ID Prefix ──

const SYSTEM_PREFIX = "__system_";

export function isSystemChatId(id: string): boolean {
  return id.startsWith(SYSTEM_PREFIX);
}

// ── Welcome / Agreement Chat ──

function buildWelcomeChat(_osType: string): SystemChat {
  return {
    metadata: {
      id: `${SYSTEM_PREFIX}welcome`,
      title: "Welcome to SnapLLM",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      image_hash: "",
      is_pinned: true,
      is_starred: false,
      pinned_at: "2026-01-01T00:00:00Z",
    },
    messages: [
      {
        id: "welcome-intro",
        role: "system",
        text: "", // Will be filled with markdown content fetched from /data/instructions/{os}.md
        timestamp: Date.now(),
        actions: [
          {
            type: "radio",
            id: "agree",
            label: "I have read and understand the instructions",
            group: "agreement",
          },
          {
            type: "radio",
            id: "disagree",
            label: "I do not understand",
            group: "agreement",
            selected: true,
          },
        ],
      },
    ],
    shouldShow: (ctx) => ctx.hasNotAgreed,
  };
}

// ── Update Notes Chat ──

function buildUpdateChat(version: string, notes: string): SystemChat {
  return {
    metadata: {
      id: `${SYSTEM_PREFIX}update_${version}`,
      title: `Update Available: ${version}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      image_hash: "",
      is_pinned: true,
      is_starred: false,
      pinned_at: new Date().toISOString(),
    },
    messages: [
      {
        id: `update-notes-${version}`,
        role: "system",
        text: `## What's New in ${version}\n\n${notes}`,
        timestamp: Date.now(),
        actions: [
          {
            type: "button",
            id: "update_now",
            label: "Update Now",
            variant: "primary",
          },
          {
            type: "button",
            id: "update_later",
            label: "Maybe Later",
            variant: "secondary",
          },
        ],
      },
    ],
    shouldShow: (ctx) => ctx.pendingUpdate !== null,
  };
}

// ── Public API ──

/**
 * Returns all system chats that should be displayed in the current context.
 * The welcome chat content (instructions markdown) must be loaded separately
 * via `loadWelcomeContent`.
 */
export function getSystemChats(ctx: SystemChatContext): SystemChat[] {
  const chats: SystemChat[] = [];

  // Welcome / Agreement
  const welcome = buildWelcomeChat(ctx.osType);
  if (welcome.shouldShow(ctx)) {
    chats.push(welcome);
  }

  // Update Notes
  if (ctx.pendingUpdate) {
    const update = buildUpdateChat(
      ctx.pendingUpdate.version,
      ctx.pendingUpdate.notes,
    );
    if (update.shouldShow(ctx)) {
      chats.push(update);
    }
  }

  return chats;
}

/** Get a specific system chat by ID, if applicable in current context */
export function getSystemChat(
  id: string,
  ctx: SystemChatContext,
): SystemChat | null {
  const all = getSystemChats(ctx);
  return all.find((c) => c.metadata.id === id) || null;
}

/**
 * Fetch the welcome instruction markdown for the given OS.
 * Returns the raw markdown string.
 */
export async function loadWelcomeContent(osType: string): Promise<string> {
  try {
    const res = await fetch(`/content/instructions/${osType}.md`);
    if (!res.ok) throw new Error("Instruction file not found");
    return await res.text();
  } catch (err) {
    console.error("Failed to load instructions:", err);
    return "# Error\nCould not load installation instructions.";
  }
}
