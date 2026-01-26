/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 *
 * Highlighter service: swapped dark theme 'dracula' -> 'vesper' (cursor-like).
 * No logic changes besides theme identifier.
 */

import { createHighlighter, type Highlighter } from "shiki";

/**
 * Singleton promise for the Shiki highlighter instance.
 * Ensures only one highlighter is created and reused across the app.
 */
let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Supported themes for dual-theme syntax highlighting.
 *
 * NOTE: Dark theme intentionally changed from 'dracula' to 'vesper'
 * (a cursor-like/darker theme requested). If your Shiki build doesn't
 * include 'vesper', ensure it's available in your project or vendor
 * the theme file into your build.
 */
export const SYNTAX_THEMES = {
  dark: "vesper",
  light: "github-light",
} as const;

/**
 * Default fallback language when requested language is not available.
 */
export const DEFAULT_LANGUAGE = "bash";

/**
 * Gets or creates the singleton Shiki highlighter instance.
 * The highlighter is lazily initialized on first call.
 */
export const getHighlighter = async (): Promise<Highlighter> => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [SYNTAX_THEMES.dark, SYNTAX_THEMES.light],
      langs: [],
    });
  }
  return highlighterPromise;
};

/**
 * Highlights code using Shiki with dual-theme support.
 * Automatically loads the requested language if not already loaded.
 *
 * @param code - The source code to highlight
 * @param language - The programming language identifier
 * @returns HTML string with syntax-highlighted code
 */
export const highlightCode = async (
  code: string,
  language: string,
): Promise<string> => {
  const highlighter = await getHighlighter();

  // Load language if not already loaded
  if (
    language &&
    language !== "text" &&
    !highlighter.getLoadedLanguages().includes(language)
  ) {
    try {
      await highlighter.loadLanguage(language as any);
    } catch (e) {
      console.warn(`[syntax] Failed to load language: ${language}`);
    }
  }

  // Use loaded language or fallback
  const lang = highlighter.getLoadedLanguages().includes(language)
    ? language
    : DEFAULT_LANGUAGE;

  return highlighter.codeToHtml(code, {
    lang,
    themes: {
      light: SYNTAX_THEMES.light,
      dark: SYNTAX_THEMES.dark,
    },
    defaultColor: false,
  });
};
