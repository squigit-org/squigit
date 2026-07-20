/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { FolderOpenIcon, Settings } from "lucide-react";
import { CustomizePanelIcon } from "@/components/icons";
import type {
  PanelPoint,
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
  onAddWorkspace: () => void;
  onClearWorkspaceUi: () => void;
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
  onAddWorkspace,
  onClearWorkspaceUi,
  onToggleWorkspaceContextMenu,
  onViewAll,
  ...workspaceSectionProps
}) => {
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
    <div className={styles.list}>
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
