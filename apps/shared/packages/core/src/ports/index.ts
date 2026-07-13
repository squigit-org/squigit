/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export type {
  StreamGeminiThreadInput,
  ProviderUnlisten,
  ProviderPort,
} from "./provider";
export { setProviderPort, getProviderPort } from "./provider";

export type {
  HarnessPort,
  HarnessPrepareTextFirstMessageInput,
  HarnessTextAttachment,
  HarnessTextFirstMessage,
} from "./harness";
export { setHarnessPort, getHarnessPort } from "./harness";

export type { StoragePort } from "./storage";
export { setStoragePort, getStoragePort } from "./storage";

export type { ConfigPort } from "./config";
export { setConfigPort, getConfigPort } from "./config";

export type {
  SystemApiKeyProvider,
  SystemEventUnlisten,
  SystemPort,
} from "./system";
export { setSystemPort, getSystemPort } from "./system";
