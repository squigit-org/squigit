/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates a Google Search URL for the given query.
 * @param query - The search query text
 * @returns The full Google Search URL
 */
export function generateSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
