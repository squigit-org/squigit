/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates a Google Translate URL for the given text.
 * @param text - The text to translate
 * @param targetLang - Target language code (default: "en")
 * @param sourceLang - Source language code (default: "auto")
 * @returns The full Google Translate URL
 */
export function generateTranslateUrl(
  text: string,
  targetLang: string = "en",
  sourceLang: string = "auto"
): string {
  const encodedText = text.replace(/ /g, "+");
  return `https://translate.google.com/?text=${encodedText}&sl=${sourceLang}&tl=${targetLang}&op=translate`;
}
