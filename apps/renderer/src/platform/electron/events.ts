/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { platform } from "./index";
import type { PlatformEventMap } from "../shared.types";

export function listenTo<K extends keyof PlatformEventMap>(
  event: K,
  handler: (payload: PlatformEventMap[K]) => void,
) {
  return platform.listen(event as string, handler);
}
