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
  Pin,
  Split,
  Trash2,
} from "lucide-react";
import type { PanelMoveWorkspace, PanelPoint } from "@/features/panel";
import styles from "./PanelThreadContextMenu.module.css";

interface PanelThreadContextMenuProps {
  x: number;
  y: number;
  isPinned: boolean;
  isForkDisabled: boolean;
  isForking: boolean;
  onClose: () => void;
  onRename: () => void;
  onPin: (pointer: PanelPoint) => void;
  onFork: () => void;
  moveWorkspaces: PanelMoveWorkspace[];
  onMoveToWorkspace: (workspaceId: string) => Promise<void>;
  onToggleSelection: () => void;
  onDelete: () => void;
}

export const PanelThreadContextMenu: React.FC<PanelThreadContextMenuProps> = ({
  x,
  y,
  isPinned,
  isForkDisabled,
  isForking,
  onClose,
  onRename,
  onPin,
  onFork,
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
        Rename thread
      </ContextMenuItem>
      <ContextMenuItem
        onClick={(event) => {
          onPin({ x: event.clientX, y: event.clientY });
          onClose();
        }}
        icon={<Pin size={14} style={{ transform: "rotate(45deg)" }} />}
      >
        {isPinned ? "Unpin thread" : "Pin thread"}
      </ContextMenuItem>
      <ContextMenuItem
        onClick={() => {
          onFork();
          onClose();
        }}
        icon={
          isForking ? (
            <Loader2 size={14} className={styles.spinner} />
          ) : (
            <Split size={14} style={{ rotate: "90deg" }} />
          )
        }
        disabled={isForkDisabled}
        aria-busy={isForking}
      >
        {isForking ? "Forking thread..." : "Fork thread"}
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
