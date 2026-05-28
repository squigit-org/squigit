/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { platform } from "./index";
import type { TauriEventMap } from "../tauri/events";

export function listenTo<K extends keyof TauriEventMap>(
  event: K,
  handler: (payload: TauriEventMap[K]) => void,
) {
  return platform.listen(event as string, handler);
}
