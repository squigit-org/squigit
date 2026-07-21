/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui";
import {
  CheckSquare,
  ChevronRight,
  Folder,
  GitBranch,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import type { PanelMoveWorkspace } from "@/features/panel";
import styles from "./PanelThreadContextMenu.module.css";

interface PanelThreadContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onRename: () => void;
  moveWorkspaces: PanelMoveWorkspace[];
  onMoveToWorkspace: (workspaceId: string) => Promise<void>;
  onToggleSelection: () => void;
  onDelete: () => void;
}

export const PanelThreadContextMenu: React.FC<PanelThreadContextMenuProps> = ({
  x,
  y,
  onClose,
  onRename,
  moveWorkspaces,
  onMoveToWorkspace,
  onToggleSelection,
  onDelete,
}) => {
  const [movingWorkspaceId, setMovingWorkspaceId] = useState<string | null>(
    null,
  );

  const moveToWorkspace = async (workspaceId: string) => {
    if (movingWorkspaceId) return;
    setMovingWorkspaceId(workspaceId);
    try {
      await onMoveToWorkspace(workspaceId);
      onClose();
    } catch {
      setMovingWorkspaceId(null);
    }
  };

  return (
    <ContextMenu x={x} y={y} onClose={onClose} width={180}>
      <ContextMenuItem
        onClick={() => {
          onRename();
          onClose();
        }}
        icon={<Pencil size={14} />}
      >
        Rename
      </ContextMenuItem>

      <div
        className={`${styles.moveItem} ${
          movingWorkspaceId ? styles.moveItemBusy : ""
        }`}
      >
        <ContextMenuItem
          icon={<GitBranch size={14} />}
          shortcut={<ChevronRight size={13} />}
          disabled={!!movingWorkspaceId}
        >
          Move to
        </ContextMenuItem>

        <div className={styles.moveSubmenu}>
          <div className={styles.heading}>Move thread to</div>
          <div className={styles.workspaceList}>
            {moveWorkspaces.map((workspace) => {
              const isMoving = movingWorkspaceId === workspace.id;
              return (
                <ContextMenuItem
                  key={workspace.id}
                  className={`${styles.workspaceItem} ${
                    isMoving ? styles.workspaceItemMoving : ""
                  }`}
                  icon={
                    isMoving ? (
                      <Loader2 size={14} className={styles.spinner} />
                    ) : (
                      <Folder size={14} />
                    )
                  }
                  title={workspace.name}
                  disabled={!!movingWorkspaceId}
                  onClick={() => moveToWorkspace(workspace.id)}
                >
                  <span className={styles.workspaceTitle}>
                    {workspace.name}
                  </span>
                </ContextMenuItem>
              );
            })}

            {moveWorkspaces.length === 0 && (
              <div className={styles.emptyState}>No other workspaces</div>
            )}
          </div>
        </div>
      </div>

      <ContextMenuSeparator />

      <ContextMenuItem
        onClick={() => {
          onToggleSelection();
          onClose();
        }}
        icon={<CheckSquare size={14} />}
      >
        Select
      </ContextMenuItem>

      <ContextMenuItem
        variant="danger"
        onClick={() => {
          onDelete();
          onClose();
        }}
        icon={<Trash2 size={14} />}
      >
        Delete
      </ContextMenuItem>
    </ContextMenu>
  );
};
