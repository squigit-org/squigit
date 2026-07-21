/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useLayoutEffect, useRef } from "react";
import { FolderOpenIcon, Settings } from "lucide-react";
import { CustomizePanelIcon } from "@/components/icons";
import type {
  PanelPoint,
  PanelThreadMoveAnimation,
  PanelThreadMenuState,
  PanelVariant,
  PanelWorkspace,
} from "../panel.types";
import { PanelTooltipButton } from "./PanelTooltipButton";
import {
  WorkspaceSection,
  type WorkspaceSectionSharedProps,
} from "./WorkspaceSection";
import styles from "./WorkspaceList.module.css";

interface WorkspaceListProps extends WorkspaceSectionSharedProps {
  variant: PanelVariant;
  collapsedWorkspaceIds: Set<string>;
  defaultWorkspace: PanelWorkspace | null;
  didInitializeWorkspaceCollapse: boolean;
  pathWorkspaces: PanelWorkspace[];
  visiblePathWorkspaces: PanelWorkspace[];
  workspaceContextMenu: PanelPoint | null;
  threadMoveAnimation: PanelThreadMoveAnimation | null;
  onAddWorkspace: () => void;
  onClearWorkspaceUi: () => void;
  onCompleteThreadMoveAnimation: () => void;
  onToggleWorkspaceContextMenu: (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  onViewAll: () => void;
}

export const WorkspaceList: React.FC<WorkspaceListProps> = ({
  variant,
  collapsedWorkspaceIds,
  defaultWorkspace,
  didInitializeWorkspaceCollapse,
  pathWorkspaces,
  visiblePathWorkspaces,
  workspaceContextMenu,
  threadMoveAnimation,
  onAddWorkspace,
  onClearWorkspaceUi,
  onCompleteThreadMoveAnimation,
  onToggleWorkspaceContextMenu,
  onViewAll,
  ...workspaceSectionProps
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !threadMoveAnimation) return;

    const row = list.querySelector<HTMLElement>(
      `[data-panel-thread-id="${CSS.escape(threadMoveAnimation.threadId)}"]`,
    );
    if (!row || row.closest('[aria-hidden="true"]')) {
      onCompleteThreadMoveAnimation();
      return;
    }

    const destination = row.getBoundingClientRect();
    const deltaX = threadMoveAnimation.origin.x - destination.left;
    const deltaY = threadMoveAnimation.origin.y - destination.top;
    const animation = row.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)`, opacity: 0.45 },
        { transform: "translate(0, 0)", opacity: 1 },
      ],
      {
        duration: 280,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      },
    );
    animation.addEventListener("finish", onCompleteThreadMoveAnimation, {
      once: true,
    });
    return () => animation.cancel();
  }, [threadMoveAnimation, onCompleteThreadMoveAnimation]);

  const renderWorkspace = (workspace: PanelWorkspace) => {
    const isDefault = workspace.path === null;
    const isCollapsed = didInitializeWorkspaceCollapse
      ? collapsedWorkspaceIds.has(workspace.id)
      : !isDefault &&
        workspace.id !== workspaceSectionProps.pendingWorkspaceId;

    return (
      <WorkspaceSection
        key={workspace.id}
        {...workspaceSectionProps}
        workspace={workspace}
        isCollapsed={isCollapsed}
      />
    );
  };

  return (
    <div
      ref={listRef}
      className={`${styles.list} ${
        variant === "flat" ? styles.flatList : ""
      }`}
    >
      {variant === "panel" && (
        <div className={styles.header}>
          <span className={styles.title}>Workspaces</span>
          <div className={styles.headerActions}>
            <PanelTooltipButton
              type="button"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={onToggleWorkspaceContextMenu}
              className={`${styles.iconButton} ${
                workspaceContextMenu ? styles.active : ""
              }`}
              tooltip="Customize workspaces"
              aria-label="Customize workspaces"
              aria-expanded={!!workspaceContextMenu}
            >
              <CustomizePanelIcon size={16} />
            </PanelTooltipButton>
            <PanelTooltipButton
              type="button"
              onClick={onClearWorkspaceUi}
              className={styles.iconButton}
              tooltip="Workspace settings"
              aria-label="Workspace settings"
            >
              <Settings size={16} />
            </PanelTooltipButton>
            <PanelTooltipButton
              type="button"
              onClick={onAddWorkspace}
              className={styles.iconButton}
              tooltip="Add workspace"
              aria-label="Add workspace"
            >
              <FolderOpenIcon size={17} />
            </PanelTooltipButton>
          </div>
        </div>
      )}

      {(variant === "flat" ? pathWorkspaces : visiblePathWorkspaces).map(
        renderWorkspace,
      )}

      {variant === "panel" && pathWorkspaces.length > 3 && (
        <div className={styles.viewAllDivider}>
          <span className={styles.viewAllLine} />
          <button
            type="button"
            className={styles.viewAllButton}
            onClick={onViewAll}
          >
            View all ({pathWorkspaces.length})
          </button>
          <span className={styles.viewAllLine} />
        </div>
      )}

      {defaultWorkspace && renderWorkspace(defaultWorkspace)}
    </div>
  );
};

export type { PanelThreadMenuState };
