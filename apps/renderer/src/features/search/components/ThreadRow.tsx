/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import styles from "./ThreadRow.module.css";

interface ThreadRowProps {
  title: string;
  snippet?: React.ReactNode;
  dateLabel?: string;
  indented?: boolean;
  onClick: () => void;
}

export const ThreadRow: React.FC<ThreadRowProps> = ({
  title,
  snippet,
  dateLabel,
  indented = false,
  onClick,
}) => {
  return (
    <button
      type="button"
      className={`${styles.row} ${indented ? styles.rowIndented : ""}`}
      onClick={onClick}
    >
      <div className={styles.rowText}>
        <span className={styles.rowTitle}>{title || "Untitled thread"}</span>
        {snippet ? <span className={styles.rowSnippet}>{snippet}</span> : null}
      </div>

      <span className={styles.rowDate}>{dateLabel || ""}</span>
    </button>
  );
};
