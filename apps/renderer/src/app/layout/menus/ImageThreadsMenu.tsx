/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ContextMenu, ContextMenuItem } from "@/components/ui";
import type { MediaThreadReference } from "@/features/media";
import { formatCompactAge } from "@squigit/core/helpers";
import styles from "./ImageThreadsMenu.module.css";

interface ImageThreadsMenuProps {
  x: number;
  y: number;
  threads: MediaThreadReference[];
  onSelect: (threadId: string) => void;
  onClose: () => void;
}

export const ImageThreadsMenu: React.FC<ImageThreadsMenuProps> = ({
  x,
  y,
  threads,
  onSelect,
  onClose,
}) => (
  <ContextMenu
    x={x}
    y={y}
    onClose={onClose}
    width={240}
    placement="top-right"
  >
    <div className={styles.heading}>Found in {threads.length} threads</div>
    <div className={styles.threadList}>
      {threads.map((thread) => (
        <ContextMenuItem
          key={thread.id}
          className={styles.threadItem}
          title={thread.title}
          shortcut={formatCompactAge(thread.updatedAt)}
          onClick={() => {
            onSelect(thread.id);
            onClose();
          }}
        >
          <span className={styles.threadTitle}>{thread.title}</span>
        </ContextMenuItem>
      ))}
    </div>
  </ContextMenu>
);
