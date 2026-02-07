/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { listen } from "@tauri-apps/api/event";

/**
 * Defines the mapping of event names to their payload types.
 */
export interface TauriEventMap {
  "gemini-stream-token": { token: string };
  // Add other events here
}

/**
 * Type-safe wrapper for tauri listen.
 */
export function listenTo<K extends keyof TauriEventMap>(
  event: K,
  handler: (payload: TauriEventMap[K]) => void,
) {
  return listen<TauriEventMap[K]>(event, (e) => handler(e.payload));
}
