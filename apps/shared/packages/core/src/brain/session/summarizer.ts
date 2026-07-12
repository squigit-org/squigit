/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { brainSessionStore } from "./store";
import { normalizeMessageForHistory } from "../attachments/memory";

/** Approximate bytes per token (same as Codex: APPROX_BYTES_PER_TOKEN = 4). */
const BYTES_PER_TOKEN = 4;

/** Estimate token count using byte-length heuristic. */
export function approxTokenCount(text: string): number {
  return Math.ceil(new TextEncoder().encode(text).length / BYTES_PER_TOKEN);
}

/**
 * Build the full conversation context for the current turn.
 */
export function buildContextWindow(): {
  historyLog: string;
} {
  const history = brainSessionStore.conversationHistory;

  const historyLog =
    history.length === 0
      ? "(No previous messages)"
      : history
          .map(
            ({ role, content }) =>
              `**${role}**: ${normalizeMessageForHistory(content)}`,
          )
          .join("\n\n");

  return { historyLog };
}
