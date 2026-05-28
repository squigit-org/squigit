/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

// This resolves to either ./tauri or ./electron at build time
export * from "@platform/index.ts";
export { platform } from "@platform/index.ts";
