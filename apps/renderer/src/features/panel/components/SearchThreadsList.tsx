/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { LoadingSpinner } from "@/components/ui";
import { formatCompactAge } from "@squigit/core/helpers";
import type { ThreadSearchResult } from "@squigit/core/config";
import {
  type ThreadGroup,
  renderSnippetWithHighlights,
} from "../search.utils";
import { SearchThreadRow } from "./SearchThreadRow";
import styles from "./SearchThreadsList.module.css";

interface SearchThreadsListProps {
  hasQuery: boolean;
  isLoading: boolean;
  results: ThreadSearchResult[];
  groups: ThreadGroup[];
  highlightTokens: string[];
  currentTime: number;
  onSelectResult: (result: ThreadSearchResult) => void;
  onSelectThread: (threadId: string) => void;
}

export const SearchThreadsList: React.FC<SearchThreadsListProps> = ({
  hasQuery,
  isLoading,
  results,
  groups,
  highlightTokens,
  currentTime,
  onSelectResult,
  onSelectThread,
}) => {
  return (
    <div className={styles.list}>
      {hasQuery ? (
        <>
          {isLoading ? (
            <div className={`${styles.status} ${styles.loadingStatus}`}>
              <LoadingSpinner />
            </div>
          ) : null}

          {!isLoading && results.length === 0 ? (
            <div className={styles.status}>No matching messages found</div>
          ) : null}

          {!isLoading
            ? results.map((result) => (
                <SearchThreadRow
                  key={`${result.thread_id}:${result.message_index}`}
                  title={result.thread_title || "Untitled thread"}
                  snippet={renderSnippetWithHighlights(
                    result.snippet,
                    highlightTokens,
                    styles.highlight,
                  )}
                  dateLabel={formatCompactAge(
                    result.thread_updated_at,
                    currentTime,
                  )}
                  onClick={() => onSelectResult(result)}
                />
              ))
            : null}
        </>
      ) : (
        <>
          {groups.length === 0 ? (
            <div className={styles.status}>No threads to show yet</div>
          ) : null}

          {groups.map((group) => (
            <div key={`${group.key}:${group.label}`} className={styles.group}>
              <div className={styles.groupHeader}>{group.label}</div>
              {group.threads.map((thread) => (
                <SearchThreadRow
                  key={thread.id}
                  indented
                  title={thread.title || "Untitled thread"}
                  dateLabel={formatCompactAge(
                    thread.updated_at || thread.created_at,
                    currentTime,
                  )}
                  onClick={() => onSelectThread(thread.id)}
                />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
};
