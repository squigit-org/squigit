/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronRight } from "lucide-react";
import { SidebarButtonWithTooltip, WidgetOverlay } from "@/components/ui";
import type { ThreadMetadata, ThreadSearchResult } from "@squigit/core/config";
import { formatCompactAge } from "@squigit/core/helpers";
import { useNavigationContext } from "@/app/context/AppNavigation";
import {
  ThreadsList,
  ThreadRow,
  SearchBar,
  buildThreadGroups,
  highlightTokensFromQuery,
} from "@/features/search";
import styles from "./SearchOverlay.module.css";
import { NewThreadIcon, SquigitsIcon } from "@/components/icons";
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
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useState<
    Set<string>
  >(() => new Set());
  const [workspaceTransitionsEnabled, setWorkspaceTransitionsEnabled] =
    useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  const normalizedQuery = query.trim();
  const hasQuery = normalizedQuery.length > 0;

  const highlightTokens = useMemo(
    () => highlightTokensFromQuery(normalizedQuery),
    [normalizedQuery],
  );

  const threadGroups = useMemo(() => buildThreadGroups(threads), [threads]);

  const workspaceItems = useMemo(() => {
    const items = app.threadHistory.workspaces.map((workspace) => ({
      ...workspace,
      threads: Object.values(workspace.threads)
        .filter((thread) => !thread.id.startsWith("__system_"))
        .sort(
          (a, b) =>
            new Date(b.updated_at || b.created_at).getTime() -
            new Date(a.updated_at || a.created_at).getTime(),
        ),
    }));
    return [
      ...items.filter((workspace) => workspace.path !== null),
      ...items.filter((workspace) => workspace.path === null),
    ];
  }, [app.threadHistory.workspaces]);
  const pathWorkspaceKey = useMemo(
    () =>
      workspaceItems
        .filter((workspace) => workspace.path !== null)
        .map((workspace) => workspace.id)
        .join("\u0000"),
    [workspaceItems],
  );

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

  useLayoutEffect(() => {
    setWorkspaceTransitionsEnabled(false);
    if (!isOpen || mode !== "workspaces") return;

    setCollapsedWorkspaceIds(
      new Set(
        pathWorkspaceKey ? pathWorkspaceKey.split("\u0000") : [],
      ),
    );

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setWorkspaceTransitionsEnabled(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [isOpen, mode, pathWorkspaceKey]);

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

  const handleToggleWorkspace = useCallback((workspaceId: string) => {
    setCollapsedWorkspaceIds((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
  }, []);

  const handleNewWorkspaceThread = useCallback(
    (workspaceId: string | null) => {
      onClose();
      app.handleNewSession(workspaceId);
    },
    [app, onClose],
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

  const renderWorkspace = (workspace: (typeof workspaceItems)[number]) => {
    const isDefault = workspace.path === null;
    const isCollapsed = isDefault
      ? false
      : collapsedWorkspaceIds.has(workspace.id);
    return (
      <section className={styles.workspace} key={workspace.id}>
        <div className={styles.workspaceHeader}>
          <span className={styles.workspaceName}>
            {workspace.name}
          </span>
          <div className={styles.workspaceActions}>
            {!isDefault && (
              <button
                type="button"
                className={styles.workspaceIconButton}
                onClick={() => handleToggleWorkspace(workspace.id)}
                title={isCollapsed ? "Expand" : "Collapse"}
                aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${workspace.name}`}
                aria-expanded={!isCollapsed}
              >
                <ChevronRight
                  size={16}
                  className={`${styles.collapseIcon} ${
                    isCollapsed ? styles.collapseIconCollapsed : ""
                  }`}
                />
              </button>
            )}
            <div className={styles.workspaceThreadAction}>
              <button
                type="button"
                className={`${styles.workspaceIconButton} ${styles.workspaceNewThreadButton}`}
                onClick={() =>
                  handleNewWorkspaceThread(isDefault ? null : workspace.id)
                }
                title="New Thread"
                aria-label={`New thread in ${workspace.name}`}
              >
                <NewThreadIcon size={16} />
              </button>
            </div>
          </div>
        </div>

        <div
          className={`${styles.workspaceThreads} ${
            isCollapsed ? styles.workspaceThreadsCollapsed : ""
          }`}
          aria-hidden={isCollapsed}
        >
          <div className={styles.workspaceThreadsClip}>
            {workspace.threads.length === 0 ? (
              <div className={styles.workspaceEmpty}>No threads yet.</div>
            ) : (
              workspace.threads.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  indented
                  title={thread.title || "Untitled thread"}
                  dateLabel={formatCompactAge(
                    thread.updated_at || thread.created_at,
                    currentTime,
                  )}
                  onClick={() => handleSelectThread(thread.id)}
                />
              ))
            )}
          </div>
        </div>
      </section>
    );
  };

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
          <div
            className={`${styles.workspaceList} ${
              workspaceTransitionsEnabled ? "" : styles.workspaceListStatic
            }`}
          >
            {workspaceItems.length === 0 ? (
              <div className={styles.workspaceStatus}>No workspaces to show</div>
            ) : (
              workspaceItems.map(renderWorkspace)
            )}
          </div>
        ) : (
          <ThreadsList
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
