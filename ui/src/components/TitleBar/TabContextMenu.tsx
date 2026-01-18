/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, XCircle, ArrowRightToLine } from "lucide-react";
import styles from "../ContextMenu/ContextMenu.module.css";

interface TabContextMenuProps {
  x: number;
  y: number;
  tabId: string;
  onClose: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onCloseToRight: () => void;
  hasTabsToRight: boolean;
  hasOtherTabs: boolean;
}

const EDGE_PADDING = 8;
const CURSOR_OFFSET = 4;

export const TabContextMenu: React.FC<TabContextMenuProps> = ({
  x,
  y,
  tabId,
  onClose,
  onCloseTab,
  onCloseOthers,
  onCloseToRight,
  hasTabsToRight,
  hasOtherTabs,
}) => {
  const [position, setPosition] = useState({ x, y });
  const [isPositioned, setIsPositioned] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!menuRef.current) return;

    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let safeX = x + CURSOR_OFFSET;
    let safeY = y + CURSOR_OFFSET;

    if (x + menuRect.width + EDGE_PADDING > viewportWidth) {
      safeX = Math.max(
        EDGE_PADDING,
        viewportWidth - menuRect.width - EDGE_PADDING,
      );
    }

    if (safeX < EDGE_PADDING) {
      safeX = EDGE_PADDING;
    }

    if (y + menuRect.height + EDGE_PADDING > viewportHeight) {
      safeY = Math.max(
        EDGE_PADDING,
        viewportHeight - menuRect.height - EDGE_PADDING,
      );
    }

    if (safeY < EDGE_PADDING) {
      safeY = EDGE_PADDING;
    }

    setPosition({ x: safeX, y: safeY });
    setIsPositioned(true);
  }, [x, y]);

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
    onClose();
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998] cursor-default"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        id="tab-context-menu"
        className={`${styles.contextMenu} fixed z-[9999] min-w-[140px]`}
        style={{
          top: position.y,
          left: position.x,
          visibility: isPositioned ? "visible" : "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => handleAction(e, onCloseTab)}
          className={`${styles.contextMenuItem} w-full text-left flex items-center gap-2`}
        >
          <X size={14} />
          <span>Close</span>
        </button>
        {hasOtherTabs && (
          <button
            onClick={(e) => handleAction(e, onCloseOthers)}
            className={`${styles.contextMenuItem} w-full text-left flex items-center gap-2`}
          >
            <XCircle size={14} />
            <span>Close Others</span>
          </button>
        )}
        {hasTabsToRight && (
          <button
            onClick={(e) => handleAction(e, onCloseToRight)}
            className={`${styles.contextMenuItem} w-full text-left flex items-center gap-2`}
          >
            <ArrowRightToLine size={14} />
            <span>Close to the Right</span>
          </button>
        )}
      </div>
    </>,
    document.body,
  );
};
