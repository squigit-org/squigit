/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui";
import { ChevronRight, Clock3 } from "lucide-react";
import { NewThreadIcon } from "@/components/icons";
import styles from "./PanelContextMenu.module.css";

export type WorkspaceOrdering = "created" | "updated";

interface PanelContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  ordering: WorkspaceOrdering;
  onChangeOrdering: (ordering: WorkspaceOrdering) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}

export const PanelContextMenu: React.FC<PanelContextMenuProps> = ({
  x,
  y,
  onClose,
  ordering,
  onChangeOrdering,
  onCollapseAll,
  onExpandAll,
}) => {
  return (
    <ContextMenu x={x} y={y} onClose={onClose} width={180}>
      <div className={styles.orderingItem}>
        <ContextMenuItem shortcut={<ChevronRight size={13} />}>
          Ordering
        </ContextMenuItem>

        <div className={styles.orderingSubmenu}>
          <button
            type="button"
            className={`${styles.orderingOption} ${
              ordering === "created" ? styles.orderingOptionActive : ""
            }`}
            onClick={() => {
              onChangeOrdering("created");
              onClose();
            }}
          >
            <NewThreadIcon size={14} />
            <span>Created</span>
          </button>
          <button
            type="button"
            className={`${styles.orderingOption} ${
              ordering === "updated" ? styles.orderingOptionActive : ""
            }`}
            onClick={() => {
              onChangeOrdering("updated");
              onClose();
            }}
          >
            <Clock3 size={14} />
            <span>Updated</span>
          </button>
        </div>
      </div>

      <ContextMenuSeparator />

      <ContextMenuItem
        onClick={() => {
          onCollapseAll();
          onClose();
        }}
      >
        Collapse all
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => {
          onExpandAll();
          onClose();
        }}
      >
        Expand all
      </ContextMenuItem>
      <ContextMenuItem disabled>Mark all as read</ContextMenuItem>
    </ContextMenu>
  );
};
