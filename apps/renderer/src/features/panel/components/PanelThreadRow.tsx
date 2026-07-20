/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MoreHorizontal, Pin, Split } from "lucide-react";
import type { ThreadMetadata } from "@squigit/core/config";
import { formatCompactAge } from "@squigit/core/helpers";
import { LoadingSpinner, Tooltip } from "@/components/ui";
import { useKeyDown } from "@/hooks/shared";
import type { PanelPoint, PanelThreadMenuState } from "../panel.types";
import { PanelCheckbox } from "./PanelCheckbox";
import { PanelTooltipButton } from "./PanelTooltipButton";
import { PanelThreadContextMenu } from "@/app/layout/menus/PanelThreadContextMenu";
import styles from "./PanelThreadRow.module.css";

export interface PanelThreadRowProps {
  thread: ThreadMetadata;
  isActive: boolean;
  isEntering: boolean;
  isBusy: boolean;
  isForking: boolean;
  isPinHoverFrozen: boolean;
  isSelectionMode: boolean;
  isSelected: boolean;
  currentTime: number;
  menuState: PanelThreadMenuState | null;
  onSelectThread: (threadId: string) => void;
  onToggleSelectionThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
  onTogglePinThread: (threadId: string, pointer: PanelPoint) => void;
  onLeaveThread: (pointer: PanelPoint) => void;
  onForkThread: (threadId: string) => void;
  onOpenContextMenu: (id: string, x: number, y: number) => void;
  onCloseContextMenu: () => void;
  onEnableSelectionMode: () => void;
}

export const PanelThreadRow: React.FC<PanelThreadRowProps> = React.memo(
  ({
    thread,
    isActive,
    isEntering,
    isBusy,
    isForking,
    isPinHoverFrozen,
    isSelectionMode,
    isSelected,
    currentTime,
    menuState,
    onSelectThread,
    onToggleSelectionThread,
    onDeleteThread,
    onRenameThread,
    onTogglePinThread,
    onLeaveThread,
    onForkThread,
    onOpenContextMenu,
    onCloseContextMenu,
    onEnableSelectionMode,
  }) => {
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(thread.title);
    const [showAgeTooltip, setShowAgeTooltip] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const ageRef = useRef<HTMLSpanElement>(null);
    const showMenu = !!menuState;

    useEffect(() => {
      if (!isRenaming || !inputRef.current) return;
      inputRef.current.focus();
      inputRef.current.select();
    }, [isRenaming]);

    useEffect(() => {
      if (!isRenaming) setRenameValue(thread.title);
    }, [isRenaming, thread.title]);

    const handleMenuClick = (event: React.MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      if (showMenu) {
        onCloseContextMenu();
        return;
      }
      onOpenContextMenu(thread.id, event.clientX, event.clientY);
    };

    const handleRenameSubmit = () => {
      if (renameValue.trim() && renameValue !== thread.title) {
        onRenameThread(thread.id, renameValue.trim());
      }
      setIsRenaming(false);
    };

    const handleRenameKeyDown = useKeyDown({
      Enter: handleRenameSubmit,
      Escape: () => {
        setRenameValue(thread.title);
        setIsRenaming(false);
      },
    });

    const lastActivityAt = thread.updated_at || thread.created_at;
    const lastActivityLabel = formatCompactAge(lastActivityAt, currentTime);
    const lastActivityTitle = useMemo(
      () => new Date(lastActivityAt).toLocaleString(),
      [lastActivityAt],
    );

    return (
      <>
        <div
          className={`${styles.threadRow} ${
            thread.pinned_at ? styles.pinnedRow : ""
          } ${isActive ? styles.active : ""} ${
            isEntering ? styles.threadRowEntering : ""
          } ${showMenu ? styles.menuOpen : ""} ${
            isPinHoverFrozen ? styles.pinHoverFrozen : ""
          }`}
          onPointerLeave={(event) =>
            onLeaveThread({ x: event.clientX, y: event.clientY })
          }
          onClick={
            isSelectionMode
              ? () => onToggleSelectionThread(thread.id)
              : () => onSelectThread(thread.id)
          }
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenContextMenu(thread.id, event.clientX, event.clientY);
          }}
        >
          {isSelectionMode ? (
            <PanelCheckbox
              checked={isSelected}
              onChange={() => onToggleSelectionThread(thread.id)}
            />
          ) : (
            <div className={styles.threadIndent} />
          )}

          {isRenaming ? (
            <input
              ref={inputRef}
              className={styles.threadTitleInput}
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleRenameKeyDown}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span
              className={styles.threadTitle}
              onDoubleClick={(event) => {
                event.stopPropagation();
                event.preventDefault();
                setIsRenaming(true);
              }}
            >
              {thread.title}
            </span>
          )}

          {!isSelectionMode && (
            <div className={styles.threadActions}>
              {isBusy ? (
                <span className={styles.rowSpinner} aria-hidden="true">
                  <span className={styles.rowSpinnerInner}>
                    <LoadingSpinner />
                  </span>
                </span>
              ) : (
                <>
                  <span
                    ref={ageRef}
                    className={styles.threadDate}
                    onMouseEnter={() => setShowAgeTooltip(true)}
                    onMouseLeave={() => setShowAgeTooltip(false)}
                  >
                    {lastActivityLabel}
                  </span>
                  <Tooltip
                    text={lastActivityTitle}
                    parentRef={ageRef}
                    show={showAgeTooltip}
                    above
                  />
                </>
              )}
              <PanelTooltipButton
                type="button"
                className={`${styles.pinButton} ${
                  thread.pinned_at ? styles.pinActive : ""
                }`}
                tooltip={thread.pinned_at ? "Unpin thread" : "Pin thread"}
                aria-label={thread.pinned_at ? "Unpin thread" : "Pin thread"}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onTogglePinThread(thread.id, {
                    x: event.clientX,
                    y: event.clientY,
                  });
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <Pin size={15} style={{ transform: "rotate(45deg)" }} />
              </PanelTooltipButton>
              <PanelTooltipButton
                type="button"
                className={`${styles.forkButton} ${
                  isForking ? styles.forkButtonLoading : ""
                }`}
                tooltip={isForking ? "Forking thread..." : "Fork thread"}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!isBusy && !isForking) onForkThread(thread.id);
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                }}
                aria-label={isForking ? "Forking thread" : "Fork thread"}
                aria-busy={isForking}
              >
                {isForking ? (
                  <Loader2 size={14} className={styles.forkSpinner} />
                ) : (
                  <Split size={14} style={{rotate:"90deg"}} />
                )}
              </PanelTooltipButton>
              <button
                type="button"
                className={styles.menuButton}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                }}
                onClick={handleMenuClick}
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          )}
        </div>

        {showMenu && menuState && (
          <PanelThreadContextMenu
            x={menuState.x}
            y={menuState.y}
            onClose={onCloseContextMenu}
            onRename={() => setIsRenaming(true)}
            onToggleSelection={() => {
              onEnableSelectionMode();
              if (!isSelected) onToggleSelectionThread(thread.id);
            }}
            onDelete={() => onDeleteThread(thread.id)}
          />
        )}
      </>
    );
  },
);
