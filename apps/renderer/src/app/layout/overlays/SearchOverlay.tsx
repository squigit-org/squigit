/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { WidgetOverlay } from "@/components/ui";
import type { ThreadMetadata, ThreadSearchResult } from "@squigit/core/config";
import { useNavigationContext } from "@/app/context/AppNavigation";
import {
  ThreadsList,
  SearchBar,
  buildThreadGroups,
  highlightTokensFromQuery,
} from "@/features/search";
import styles from "./SearchOverlay.module.css";

const SEARCH_LIMIT = 80;
const SEARCH_DEBOUNCE_MS = 120;

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  threads: ThreadMetadata[];
  searchThreads: (
    query: string,
    limit: number,
  ) => Promise<ThreadSearchResult[]>;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  isOpen,
  onClose,
  threads,
  searchThreads,
}) => {
  const navigation = useNavigationContext();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ThreadSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  const normalizedQuery = query.trim();
  const hasQuery = normalizedQuery.length > 0;

  const highlightTokens = useMemo(
    () => highlightTokensFromQuery(normalizedQuery),
    [normalizedQuery],
  );

  const threadGroups = useMemo(() => buildThreadGroups(threads), [threads]);

  const firstThreadId = threadGroups[0]?.threads[0]?.id ?? null;

  useEffect(() => {
    if (!isOpen) {
      requestIdRef.current += 1;
      setQuery("");
      setResults([]);
      setIsLoading(false);
      return;
    }

    const raf = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(raf);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (!hasQuery) {
      requestIdRef.current += 1;
      setResults([]);
      setIsLoading(false);
      return;
    }

    const currentRequestId = ++requestIdRef.current;
    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      const hits = await searchThreads(normalizedQuery, SEARCH_LIMIT);
      if (currentRequestId !== requestIdRef.current) return;
      setResults(hits);
      setIsLoading(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hasQuery, isOpen, normalizedQuery, searchThreads]);

  const handleSelectResult = useCallback(
    (result: ThreadSearchResult) => {
      navigation.revealSearchMatch({
        threadId: result.thread_id,
        messageIndex: result.message_index,
      });
    },
    [navigation],
  );

  const handleSelectThread = useCallback(
    (threadId: string) => {
      onClose();
      navigation.handleSelectThread(threadId);
    },
    [navigation, onClose],
  );

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Enter") return;
      event.preventDefault();

      if (hasQuery) {
        if (results.length > 0) {
          handleSelectResult(results[0]);
        }
        return;
      }

      if (firstThreadId) {
        handleSelectThread(firstThreadId);
      }
    },
    [
      firstThreadId,
      handleSelectThread,
      handleSelectResult,
      hasQuery,
      onClose,
      results,
    ],
  );

  return (
    <WidgetOverlay
      isOpen={isOpen}
      onClose={onClose}
      contentClassName={styles.content}
      sectionContentClassName={styles.section}
    >
      <div className={styles.root}>
        <SearchBar
          query={query}
          onQueryChange={setQuery}
          onInputKeyDown={handleInputKeyDown}
          inputRef={inputRef}
        />

        <ThreadsList
          hasQuery={hasQuery}
          isLoading={isLoading}
          results={results}
          groups={threadGroups}
          highlightTokens={highlightTokens}
          onSelectResult={handleSelectResult}
          onSelectThread={handleSelectThread}
        />
      </div>
    </WidgetOverlay>
  );
};
