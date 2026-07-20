/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, X } from "lucide-react";
import { NewThreadIcon } from "@/components/icons";
import type {
  PanelPoint,
  PanelThreadMenuState,
  PanelWorkspace,
} from "../panel.types";
import { PanelThreadRow } from "./PanelThreadRow";
import { PanelTooltipButton } from "./PanelTooltipButton";
import styles from "./WorkspaceSection.module.css";

interface WorkspaceNewThreadButtonProps {
  workspaceName: string;
  isVisible: boolean;
  isNavigating: boolean;
  isHomeRoute: boolean;
  isThreadBusy: boolean;
  onNewThread: () => void;
}

const WorkspaceNewThreadButton: React.FC<
  WorkspaceNewThreadButtonProps
> = ({
  workspaceName,
  isVisible,
  isNavigating,
  isHomeRoute,
  isThreadBusy,
  onNewThread,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const navigationStartedRef = useRef(false);
  const showLoading = isLoading && !isHomeRoute;

  useEffect(() => {
    if (!isLoading) {
      navigationStartedRef.current = false;
      return;
    }

    if (isNavigating) {
      navigationStartedRef.current = true;
      return;
    }

    if (isHomeRoute || navigationStartedRef.current) setIsLoading(false);
  }, [isHomeRoute, isLoading, isNavigating]);

  return (
    <PanelTooltipButton
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        if (isLoading || isNavigating) return;
        if (!isThreadBusy) setIsLoading(true);
        onNewThread();
      }}
      className={`${styles.iconButton} ${styles.workspaceNewThreadButton} ${
        showLoading ? styles.workspaceNewThreadButtonLoading : ""
      }`}
      tooltip={showLoading ? "Opening new thread..." : "New Thread"}
      aria-label={
        showLoading
          ? `Opening new thread in ${workspaceName}`
          : `New thread in ${workspaceName}`
      }
      aria-busy={showLoading}
      disabled={isLoading || isNavigating}
      tabIndex={isVisible ? 0 : -1}
      aria-hidden={!isVisible}
    >
      {showLoading ? (
        <Loader2 size={16} className={styles.newThreadSpinner} />
      ) : (
        <NewThreadIcon size={16} />
      )}
    </PanelTooltipButton>
  );
};

export interface WorkspaceSectionSharedProps {
  activeSessionId: string | null;
  activeThreadContextMenu: PanelThreadMenuState | null;
  busyThreadId: string | null;
  currentTime: number;
  enteringThreadIds: Set<string>;
  forkingThreadIds: Set<string>;
  isHomeRoute: boolean;
  isNavigating: boolean;
  isPinHoverFrozen: boolean;
  isSelectionMode: boolean;
  isThreadBusy: boolean;
  pendingWorkspaceId: string | null;
  selectedIdSet: Set<string>;
  onCancelPendingThread: () => void;
  onCloseContextMenu: () => void;
  onDeleteThread: (threadId: string) => void;
  onEnableSelectionMode: () => void;
  onForkThread: (threadId: string) => void;
  onLeaveThread: (pointer: PanelPoint) => void;
  onNewThread: (workspaceId: string | null) => void;
  onOpenContextMenu: (id: string, x: number, y: number) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
  onSelectThread: (threadId: string) => void;
  onTogglePinThread: (threadId: string, pointer: PanelPoint) => void;
  onToggleSelectionThread: (threadId: string) => void;
  onToggleWorkspace: (workspaceId: string) => void;
}

interface WorkspaceSectionProps extends WorkspaceSectionSharedProps {
  workspace: PanelWorkspace;
  isCollapsed: boolean;
}

export const WorkspaceSection: React.FC<WorkspaceSectionProps> = ({
  workspace,
  isCollapsed,
  activeSessionId,
  activeThreadContextMenu,
  busyThreadId,
  currentTime,
  enteringThreadIds,
  forkingThreadIds,
  isHomeRoute,
  isNavigating,
  isPinHoverFrozen,
  isSelectionMode,
  isThreadBusy,
  pendingWorkspaceId,
  selectedIdSet,
  onCancelPendingThread,
  onCloseContextMenu,
  onDeleteThread,
  onEnableSelectionMode,
  onForkThread,
  onLeaveThread,
  onNewThread,
  onOpenContextMenu,
  onRenameThread,
  onSelectThread,
  onTogglePinThread,
  onToggleSelectionThread,
  onToggleWorkspace,
}) => {
  const isDefault = workspace.path === null;
  const showPendingThread =
    !isDefault && isHomeRoute && pendingWorkspaceId === workspace.id;
  const showNewThreadButton = isDefault ? !isHomeRoute : !showPendingThread;

  return (
    <section className={styles.workspace}>
      <div
        className={styles.workspaceDivider}
        role="button"
        tabIndex={0}
        aria-expanded={!isCollapsed}
        onClick={() => onToggleWorkspace(workspace.id)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onToggleWorkspace(workspace.id);
        }}
      >
        <ChevronRight
          size={15}
          className={`${styles.workspaceChevron} ${
            isCollapsed ? "" : styles.workspaceChevronExpanded
          }`}
        />
        <span className={styles.workspaceLabel}>{workspace.name}</span>
        <div className={styles.workspaceActions}>
          <div
            className={`${styles.workspaceThreadAction} ${
              showNewThreadButton ? styles.workspaceThreadActionEnabled : ""
            }`}
          >
            <WorkspaceNewThreadButton
              workspaceName={workspace.name}
              isVisible={showNewThreadButton}
              isNavigating={isNavigating}
              isHomeRoute={isHomeRoute}
              isThreadBusy={isThreadBusy}
              onNewThread={() => onNewThread(isDefault ? null : workspace.id)}
            />
          </div>
        </div>
      </div>

      <div
        className={`${styles.workspaceThreads} ${
          isCollapsed ? styles.workspaceThreadsCollapsed : ""
        }`}
        aria-hidden={isCollapsed}
      >
        <div className={styles.workspaceThreadsClip}>
          <div className={styles.workspaceInner}>
            {showPendingThread && (
              <div
                className={`${styles.pendingThreadRow} ${styles.threadRow}`}
                aria-label={`New thread pending in ${workspace.name}`}
              >
                <div className={styles.threadIndent} />
                <span className={styles.threadTitle}>New thread</span>
                <PanelTooltipButton
                  type="button"
                  className={styles.pendingThreadClose}
                  onClick={onCancelPendingThread}
                  tooltip="Cancel new thread"
                  aria-label={`Cancel new thread in ${workspace.name}`}
                >
                  <X size={14} />
                </PanelTooltipButton>
              </div>
            )}

            {workspace.threads.map((thread) => (
              <PanelThreadRow
                key={thread.id}
                thread={thread}
                isActive={thread.id === activeSessionId}
                isEntering={enteringThreadIds.has(thread.id)}
                isBusy={busyThreadId === thread.id}
                isForking={forkingThreadIds.has(thread.id)}
                isPinHoverFrozen={isPinHoverFrozen}
                isSelectionMode={isSelectionMode}
                isSelected={selectedIdSet.has(thread.id)}
                currentTime={currentTime}
                menuState={
                  activeThreadContextMenu?.id === thread.id
                    ? activeThreadContextMenu
                    : null
                }
                onSelectThread={onSelectThread}
                onToggleSelectionThread={onToggleSelectionThread}
                onDeleteThread={onDeleteThread}
                onRenameThread={onRenameThread}
                onTogglePinThread={onTogglePinThread}
                onLeaveThread={onLeaveThread}
                onForkThread={onForkThread}
                onOpenContextMenu={onOpenContextMenu}
                onCloseContextMenu={onCloseContextMenu}
                onEnableSelectionMode={onEnableSelectionMode}
              />
            ))}

            {workspace.threads.length === 0 && !showPendingThread && (
              <div className={styles.emptyState}>No threads yet.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
