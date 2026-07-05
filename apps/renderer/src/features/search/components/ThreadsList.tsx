/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { LoadingSpinner } from "@/components/ui";
import type { ThreadSearchResult } from "@squigit/core/config";
import {
  type ThreadGroup,
  formatSearchRowDate,
  renderSnippetWithHighlights,
} from "../search.utils";
import { ThreadRow } from "./ThreadRow";
import styles from "./ThreadsList.module.css";

interface ThreadsListProps {
  hasQuery: boolean;
  isLoading: boolean;
  results: ThreadSearchResult[];
  groups: ThreadGroup[];
  highlightTokens: string[];
  onSelectResult: (result: ThreadSearchResult) => void;
  onSelectThread: (threadId: string) => void;
}

export const ThreadsList: React.FC<ThreadsListProps> = ({
  hasQuery,
  isLoading,
  results,
  groups,
  highlightTokens,
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
                <ThreadRow
                  key={`${result.thread_id}:${result.message_index}`}
                  title={result.thread_title || "Untitled thread"}
                  snippet={renderSnippetWithHighlights(
                    result.snippet,
                    highlightTokens,
                    styles.highlight,
                  )}
                  dateLabel={formatSearchRowDate(result.thread_updated_at)}
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
                <ThreadRow
                  key={thread.id}
                  compact
                  title={thread.title || "Untitled thread"}
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
