/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { MessageCircle } from "lucide-react";
import styles from "./ThreadRow.module.css";

interface ThreadRowProps {
  title: string;
  snippet?: React.ReactNode;
  dateLabel?: string;
  compact?: boolean;
  onClick: () => void;
}

export const ThreadRow: React.FC<ThreadRowProps> = ({
  title,
  snippet,
  dateLabel,
  compact = false,
  onClick,
}) => {
  return (
    <button
      type="button"
      className={`${styles.row} ${compact ? styles.rowCompact : ""}`}
      onClick={onClick}
    >
      <div className={styles.rowIcon}>
        <MessageCircle size={16} />
      </div>

      <div className={styles.rowText}>
        <div className={styles.rowTitle}>{title || "Untitled thread"}</div>
        {snippet ? <div className={styles.rowSnippet}>{snippet}</div> : null}
      </div>

      {!compact ? (
        <div className={styles.rowDate}>{dateLabel || ""}</div>
      ) : null}
    </button>
  );
};
