/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export const geminiStore = {
  currentAbortController: null as AbortController | null,
  currentUnlisten: null as (() => void) | null,
  currentChannelId: null as string | null,
  generationId: 0,
  storedApiKey: null as string | null,
  currentModelId: "gemini-2.0-flash",
  imageDescription: null as string | null,
  userFirstMsg: null as string | null,
  conversationHistory: [] as Array<{ role: string; content: string }>,
  storedImagePath: null as string | null,
};
