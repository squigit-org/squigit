/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from "react";
import { Dialog } from "@/components/ui";
import { getDeleteMultipleThreadsDialog } from "@squigit/core/helpers";
import { useAppContext } from "@/app/providers/AppProvider";
import type { SidePanelProps } from "./panel.types";
import { usePanelSelection } from "./hooks/usePanelSelection";
import { usePanelThreads } from "./hooks/usePanelThreads";
import { usePanelWorkspaces } from "./hooks/usePanelWorkspaces";
import { PanelSelectionHeader } from "./components/PanelSelectionHeader";
import { WorkspaceContextMenu } from "@/app/layout/menus/WorkspaceContextMenu";
import { WorkspaceList } from "./components/WorkspaceList";
import styles from "./SidePanel.module.css";

export const SidePanel: React.FC<SidePanelProps> = ({
  variant = "panel",
  onNavigate,
}) => {
  const app = useAppContext();
  const activeSessionId = app.threadHistory.activeSessionId;
  const selection = usePanelSelection(app.threadHistory.threads);
  const workspaces = usePanelWorkspaces({ activeSessionId, onNavigate });
  const panelThreads = usePanelThreads({
    activeSessionId,
    cancelPendingThread: workspaces.cancelPendingThread,
    closeWorkspaceContextMenu: workspaces.closeWorkspaceContextMenu,
    consumePendingThread: workspaces.consumePendingThread,
    isHomeRoute: workspaces.isHomeRoute,
    onNavigate,
    pendingWorkspaceId: workspaces.pendingWorkspaceId,
    restorePendingWorkspaceCollapse:
      workspaces.restorePendingWorkspaceCollapse,
    workspaceItems: workspaces.workspaceItems,
  });

  const handleToggleWorkspaceContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      panelThreads.closeContextMenu();
      workspaces.toggleWorkspaceContextMenu(event);
    }, [panelThreads.closeContextMenu, workspaces.toggleWorkspaceContextMenu],
  );

  return (
    <div
      className={`${styles.panel} ${variant === "flat" ? styles.flat : ""}`}
    >
      {selection.isSelectionMode ? (
        <PanelSelectionHeader
          selectedCount={selection.selectedIds.length}
          totalCount={selection.allThreads.length}
          onSelectAll={selection.selectAll}
          onDelete={() => {
            if (selection.selectedIds.length > 0) {
              selection.setShowBulkDelete(true);
            }
          }}
          onClose={selection.closeSelectionMode}
        />
      ) : variant === "panel" ? (
        <div className={styles.headerArea}>Squigit</div>
      ) : null}

      <WorkspaceList
        variant={variant}
        activeSessionId={activeSessionId}
        activeThreadContextMenu={panelThreads.activeThreadContextMenu}
        busyThreadId={panelThreads.busyThreadId}
        collapsedWorkspaceIds={workspaces.collapsedWorkspaceIds}
        currentTime={panelThreads.currentTime}
        defaultWorkspace={workspaces.defaultWorkspace}
        didInitializeWorkspaceCollapse={
          workspaces.didInitializeWorkspaceCollapse
        }
        enteringThreadIds={panelThreads.enteringThreadIds}
        forkingThreadIds={panelThreads.forkingThreadIds}
        isHomeRoute={workspaces.isHomeRoute}
        isNavigating={workspaces.isNavigating}
        isPinHoverFrozen={panelThreads.isPinHoverFrozen}
        isSelectionMode={selection.isSelectionMode}
        isThreadBusy={panelThreads.isThreadBusy}
        pathWorkspaces={workspaces.pathWorkspaces}
        pendingWorkspaceId={workspaces.pendingWorkspaceId}
        selectedIdSet={selection.selectedIdSet}
        visiblePathWorkspaces={workspaces.visiblePathWorkspaces}
        workspaceContextMenu={workspaces.workspaceContextMenu}
        onAddWorkspace={workspaces.createWorkspace}
        onCancelPendingThread={workspaces.cancelPendingThread}
        onClearWorkspaceUi={workspaces.clearWorkspaceUi}
        onCloseContextMenu={panelThreads.closeContextMenu}
        onDeleteThread={selection.queueDeleteThread}
        onEnableSelectionMode={selection.enableSelectionMode}
        onForkThread={panelThreads.forkThread}
        onLeaveThread={panelThreads.leaveThread}
        onNewThread={workspaces.openNewThread}
        onOpenContextMenu={panelThreads.openContextMenu}
        onRenameThread={panelThreads.renameThread}
        onSelectThread={panelThreads.navigateToThread}
        onTogglePinThread={panelThreads.togglePin}
        onToggleSelectionThread={selection.toggleThreadSelection}
        onToggleWorkspace={workspaces.toggleWorkspace}
        onToggleWorkspaceContextMenu={handleToggleWorkspaceContextMenu}
        onViewAll={() => app.openSearchOverlay("workspaces")}
      />

      {workspaces.workspaceContextMenu && (
        <WorkspaceContextMenu
          x={workspaces.workspaceContextMenu.x}
          y={workspaces.workspaceContextMenu.y}
          onClose={workspaces.closeWorkspaceContextMenu}
          ordering={workspaces.workspaceOrdering}
          onChangeOrdering={workspaces.setWorkspaceOrdering}
          onCollapseAll={workspaces.collapseAllWorkspaces}
          onExpandAll={workspaces.expandAllWorkspaces}
        />
      )}

      <Dialog
        isOpen={!!selection.deleteThreadId}
        type="DELETE_THREAD"
        onAction={(key) => {
          if (key === "confirm") selection.confirmDeleteThread();
          else selection.setDeleteThreadId(null);
        }}
      />

      <Dialog
        isOpen={selection.showBulkDelete}
        type={getDeleteMultipleThreadsDialog(selection.selectedIds.length)}
        onAction={(key) => {
          if (key === "confirm") selection.confirmBulkDelete();
          else selection.setShowBulkDelete(false);
        }}
      />

      <Dialog
        isOpen={!!workspaces.workspaceError}
        variant="warning"
        title="Workspace unavailable"
        message={workspaces.workspaceError || ""}
        actions={[
          {
            label: "Close",
            variant: "primary",
            onClick: () => workspaces.setWorkspaceError(null),
          },
        ]}
      />
    </div>
  );
};
