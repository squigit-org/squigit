/**
 * @license
 * Copyright (c) ncdai
 * SPDX-License-Identifier: MIT
 */

import { useCallback, useRef } from "react";

const TYPEAHEAD_TIMEOUT_MS = 500;

type UseTypeaheadSearchOptions<T> = {
  getTextValue: (option: T) => string;
  getCurrentIndex: () => number;
  onMatch: (index: number) => void;
};

export function useTypeaheadSearch<T>(
  options: T[],
  { getTextValue, getCurrentIndex, onMatch }: UseTypeaheadSearchOptions<T>,
) {
  const searchBufferRef = useRef("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTypeahead = useCallback(() => {
    searchBufferRef.current = "";
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const handleTypeaheadSearch = useCallback(
    (char: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      searchBufferRef.current += char.toLowerCase();
      const searchTerm = searchBufferRef.current;

      const isRepeated =
        searchTerm.length > 1 &&
        Array.from(searchTerm).every((c) => c === searchTerm[0]);

      const normalizedSearch = isRepeated ? searchTerm[0] : searchTerm;

      const currentIndex = getCurrentIndex();

      const shouldCycle = normalizedSearch.length === 1;

      let matchIndex = -1;

      if (shouldCycle) {
        for (let i = 1; i <= options.length; i++) {
          const index = (currentIndex + i) % options.length;
          const text = getTextValue(options[index]);
          if (text.toLowerCase().startsWith(normalizedSearch)) {
            matchIndex = index;
            break;
          }
        }
      } else {
        matchIndex = options.findIndex((option) => {
          const text = getTextValue(option);
          return text.toLowerCase().startsWith(normalizedSearch);
        });
      }

      if (matchIndex !== -1) {
        onMatch(matchIndex);
      }

      timeoutRef.current = setTimeout(() => {
        searchBufferRef.current = "";
        timeoutRef.current = null;
      }, TYPEAHEAD_TIMEOUT_MS);
    },
    [options, getTextValue, getCurrentIndex, onMatch],
  );

  return {
    handleTypeaheadSearch,
    resetTypeahead,
  };
}
