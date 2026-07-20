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
import { SidebarButtonWithTooltip, WidgetOverlay } from "@/components/ui";
import type { ThreadMetadata, ThreadSearchResult } from "@squigit/core/config";
import { useNavigationContext } from "@/app/context/AppNavigation";
import {
  SearchThreadsList,
  SearchBar,
  buildThreadGroups,
  highlightTokensFromQuery,
  SidePanel,
} from "@/features/panel";
import styles from "./SearchOverlay.module.css";
import { SquigitsIcon } from "@/components/icons";
import { useAppContext } from "@/app/providers/AppProvider";

const SEARCH_LIMIT = 80;
const SEARCH_DEBOUNCE_MS = 120;

interface SearchOverlayProps {
  isOpen: boolean;
  mode: "threads" | "workspaces";
  onClose: () => void;
  threads: ThreadMetadata[];
  searchThreads: (
    query: string,
    limit: number,
  ) => Promise<ThreadSearchResult[]>;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({
  isOpen,
  mode,
  onClose,
  threads,
  searchThreads,
}) => {
  const app = useAppContext();
  const navigation = useNavigationContext();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ThreadSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
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
    const syncCurrentTime = () => setCurrentTime(Date.now());
    syncCurrentTime();
    const intervalId = window.setInterval(syncCurrentTime, 30_000);
    return () => window.clearInterval(intervalId);
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

  const handleNavigation = useCallback(
    (screenId: string) => {
      onClose();
      app.handleNavigation(screenId);
    },
    [app, onClose],
  );

  const handleSelectThread = useCallback(
    (threadId: string) => {
      onClose();
      navigation.handleNavigation(threadId);
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

      if (mode === "threads" && firstThreadId) {
        handleSelectThread(firstThreadId);
      }
    },
    [
      firstThreadId,
      handleSelectThread,
      handleSelectResult,
      hasQuery,
      mode,
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
      sidebarBottom={
        <SidebarButtonWithTooltip
          icon={<SquigitsIcon size={22} />}
          label="Your squigits"
          onClick={() => handleNavigation("__system_gallery")}
        />
      }
    >
      <div className={styles.root}>
        <SearchBar
          query={query}
          onQueryChange={setQuery}
          onInputKeyDown={handleInputKeyDown}
          inputRef={inputRef}
        />

        {mode === "workspaces" && !hasQuery ? (
          isOpen ? (
            <SidePanel variant="flat" onNavigate={onClose} />
          ) : null
        ) : (
          <SearchThreadsList
            hasQuery={hasQuery}
            isLoading={isLoading}
            results={results}
            groups={threadGroups}
            highlightTokens={highlightTokens}
            currentTime={currentTime}
            onSelectResult={handleSelectResult}
            onSelectThread={handleSelectThread}
          />
        )}
      </div>
    </WidgetOverlay>
  );
};
