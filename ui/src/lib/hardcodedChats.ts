/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Hardcoded (system) chats registry.
 *
 * Virtual chats that are injected into the panel without touching disk storage.
 * IDs are prefixed with `__system_` so they're trivially distinguishable from
 * real disk-backed chats.
 */

import type { ChatMetadata } from "@/lib/storage";

// Re-use the frontend Message type so restoreState works directly.
export interface HardcodedMessage {
  id: string;
  role: "user" | "model" | "system";
  text: string;
  timestamp: number;
}

export interface HardcodedChat {
  metadata: ChatMetadata;
  messages: HardcodedMessage[];
  /** When should this chat appear in the panel? */
  shouldShow: (ctx: HardcodedChatContext) => boolean;
}

export interface HardcodedChatContext {
  isGuest: boolean;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const SYSTEM_CHATS: HardcodedChat[] = [
  {
    metadata: {
      id: "__system_welcome",
      title: "Welcome to SnapLLM",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      image_hash: "",
      is_pinned: false,
      is_starred: false,
      pinned_at: null,
    },
    messages: [
      {
        id: "welcome-0",
        role: "model",
        text: "Welcome to SnapLLM! Please log in to start chatting.",
        timestamp: new Date("2026-01-01T00:00:00Z").getTime(),
      },
    ],
    shouldShow: (ctx) => ctx.isGuest,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Check if a chat ID belongs to a hardcoded system chat. */
export function isHardcodedChatId(id: string): boolean {
  return id.startsWith("__system_");
}

/** Get all hardcoded chats that should be visible in the given context. */
export function getHardcodedChats(ctx: HardcodedChatContext): HardcodedChat[] {
  return SYSTEM_CHATS.filter((c) => c.shouldShow(ctx));
}

/** Get a specific hardcoded chat by ID (or undefined). */
export function getHardcodedChat(id: string): HardcodedChat | undefined {
  return SYSTEM_CHATS.find((c) => c.metadata.id === id);
}
