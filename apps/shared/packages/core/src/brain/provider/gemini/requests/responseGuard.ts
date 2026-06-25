/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const EMPTY_PROVIDER_RESPONSE_MESSAGE =
  "Gemini returned an empty response before writing an answer. Please retry.";

export function requireNonEmptyProviderResponse(response: string): string {
  const normalized = response.trim();
  if (!normalized) {
    throw new Error(EMPTY_PROVIDER_RESPONSE_MESSAGE);
  }
  return normalized;
}
