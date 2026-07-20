/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Trash2, X } from "lucide-react";
import { PanelCheckbox } from "./PanelCheckbox";
import styles from "./PanelSelectionHeader.module.css";

interface PanelSelectionHeaderProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const PanelSelectionHeader: React.FC<PanelSelectionHeaderProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onDelete,
  onClose,
}) => (
  <div className={styles.selectionHeader}>
    <div className={styles.selectionLeft}>
      <PanelCheckbox
        checked={selectedCount === totalCount && totalCount > 0}
        onChange={onSelectAll}
      />
      <span className={styles.labelAll}>All</span>
    </div>

    <div className={styles.selectionCenter}>
      <span className={styles.selectionCount}>{selectedCount} selected</span>
    </div>

    <div className={styles.selectionRight}>
      <button
        type="button"
        className={`${styles.iconButton} ${styles.danger}`}
        onClick={onDelete}
        disabled={selectedCount === 0}
      >
        <Trash2 size={16} />
      </button>
      <button type="button" className={styles.iconButton} onClick={onClose}>
        <X size={18} />
      </button>
    </div>
  </div>
);
