/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import {
  bundledLanguages,
  bundledLanguagesInfo,
  createHighlighter,
  type BundledLanguage,
  type Highlighter,
} from "shiki";

export const SYNTAX_THEMES = {
  dark: "vesper",
  light: "github-light",
} as const;

export const DEFAULT_LANGUAGE = "text";

let highlighterPromise: Promise<Highlighter> | null = null;
const languageLoadPromises = new Map<string, Promise<void>>();
const languageIds = new Map<string, BundledLanguage>();

for (const language of bundledLanguagesInfo) {
  const id = language.id as BundledLanguage;
  languageIds.set(language.id.toLowerCase(), id);
  for (const alias of language.aliases ?? []) {
    languageIds.set(alias.toLowerCase(), id);
  }
}

export const getHighlighter = async (): Promise<Highlighter> => {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [SYNTAX_THEMES.dark, SYNTAX_THEMES.light],
      langs: [],
    });
  }
  return highlighterPromise;
};

export const highlightCode = async (
  code: string,
  language: string,
): Promise<string> => {
  const highlighter = await getHighlighter();
  const requestedLanguage = language.trim().toLowerCase();
  const languageId = languageIds.get(requestedLanguage);

  if (languageId && !highlighter.getLoadedLanguages().includes(languageId)) {
    let loadPromise = languageLoadPromises.get(languageId);

    if (!loadPromise) {
      loadPromise = highlighter
        .loadLanguage(bundledLanguages[languageId])
        .finally(() => languageLoadPromises.delete(languageId));
      languageLoadPromises.set(languageId, loadPromise);
    }

    try {
      await loadPromise;
    } catch {
      // Unsupported or unavailable grammars render as plain text.
    }
  }

  const lang =
    languageId && highlighter.getLoadedLanguages().includes(languageId)
      ? languageId
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

const CACHE_MAX = 64;
const CACHE_MAX_CODE_LENGTH = 50_000;
const highlightCache = new Map<string, string>();
const highlightPromiseCache = new Map<string, Promise<string>>();

function cacheKey(code: string, language: string): string {
  return `${language}\0${code}`;
}

function cacheSet(key: string, html: string): void {
  if (highlightCache.size >= CACHE_MAX) {
    const firstKey = highlightCache.keys().next().value;
    if (firstKey !== undefined) {
      highlightCache.delete(firstKey);
    }
  }
  highlightCache.set(key, html);
}

function getHighlightPromise(
  key: string | null,
  code: string,
  language: string,
): Promise<string> {
  const existingPromise = key ? highlightPromiseCache.get(key) : undefined;
  if (existingPromise) {
    return existingPromise;
  }

  const nextPromise = highlightCode(code, language)
    .then((html) => {
      if (key) {
        cacheSet(key, html);
        highlightPromiseCache.delete(key);
      }
      return html;
    })
    .catch((error) => {
      if (key) highlightPromiseCache.delete(key);
      throw error;
    });

  if (key) highlightPromiseCache.set(key, nextPromise);
  return nextPromise;
}

interface HighlightState {
  code: string;
  language: string;
  html: string;
}

export const useCodeHighlighter = (
  code: string,
  language: string,
  enabled = true,
  delayMs = 0,
) => {
  const normalizedLanguage = language.trim().toLowerCase();
  const shouldHighlight = enabled && normalizedLanguage !== "text";
  const key =
    shouldHighlight && code.length <= CACHE_MAX_CODE_LENGTH
      ? cacheKey(code, normalizedLanguage)
      : null;
  const cached = key ? highlightCache.get(key) : undefined;

  const [highlight, setHighlight] = useState<HighlightState>({
    code: cached ? code : "",
    language: cached ? normalizedLanguage : "",
    html: cached ?? "",
  });
  const [isLoading, setIsLoading] = useState(
    shouldHighlight && !cached,
  );

  useEffect(() => {
    if (!shouldHighlight) {
      setIsLoading(false);
      return;
    }

    const hit = key ? highlightCache.get(key) : undefined;
    if (hit) {
      setHighlight({ code, language: normalizedLanguage, html: hit });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let isMounted = true;
    let timer: number | null = null;

    const doHighlight = async () => {
      try {
        const html = await getHighlightPromise(
          key,
          code,
          normalizedLanguage,
        );

        if (isMounted) {
          setHighlight({ code, language: normalizedLanguage, html });
          setIsLoading(false);
        }
      } catch {
        if (isMounted) setIsLoading(false);
      }
    };

    if (delayMs > 0) {
      timer = window.setTimeout(() => void doHighlight(), delayMs);
    } else {
      void doHighlight();
    }

    return () => {
      isMounted = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [code, delayMs, key, normalizedLanguage, shouldHighlight]);

  const hasCurrentHighlight =
    highlight.code === code && highlight.language === normalizedLanguage;

  return {
    highlightedHtml: hasCurrentHighlight ? highlight.html : "",
    isLoading: shouldHighlight && (isLoading || !hasCurrentHighlight),
  };
};
