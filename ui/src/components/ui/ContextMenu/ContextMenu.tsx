/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, ClipboardPaste, Scissors, TextSelect } from "lucide-react";
import styles from "./ContextMenu.module.css";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onCut?: () => void;
  onSelectAll?: () => void;
  selectedText?: string;
  hasSelection?: boolean;
}

// Edge padding to keep menu away from window edges
const EDGE_PADDING = 8;
// Offset from cursor position
const CURSOR_OFFSET = 4;

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  onCopy,
  onPaste,
  onCut,
  onSelectAll,
  selectedText = "",
  hasSelection = false,
}) => {
  const [position, setPosition] = useState({ x, y });
  const [isPositioned, setIsPositioned] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasText = hasSelection || selectedText.length > 0;

  // Calculate safe position after menu renders
  useLayoutEffect(() => {
    if (!menuRef.current) return;

    const menuRect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let safeX = x + CURSOR_OFFSET;
    let safeY = y + CURSOR_OFFSET;

    // Check right edge overflow - flip to left of cursor
    if (x + menuRect.width + EDGE_PADDING > viewportWidth) {
      safeX = Math.max(
        EDGE_PADDING,
        viewportWidth - menuRect.width - EDGE_PADDING
      );
    }

    // Check left edge overflow
    if (safeX < EDGE_PADDING) {
      safeX = EDGE_PADDING;
    }

    // Check bottom edge overflow - flip to above cursor
    if (y + menuRect.height + EDGE_PADDING > viewportHeight) {
      safeY = Math.max(
        EDGE_PADDING,
        viewportHeight - menuRect.height - EDGE_PADDING
      );
    }

    // Check top edge overflow
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

  // Check if we have any actions to show
  const showCopy = onCopy && hasText;
  const showCut = onCut && hasText;
  const showPaste = onPaste;
  const showSelectAll = onSelectAll;

  if (!showCopy && !showCut && !showPaste && !showSelectAll) return null;

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
        id="app-context-menu"
        className={`${styles.contextMenu} fixed z-[9999] min-w-[120px]`}
        style={{
          top: position.y,
          left: position.x,
          visibility: isPositioned ? "visible" : "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {showCut && (
          <button
            onClick={(e) => handleAction(e, onCut!)}
            className={`${styles.contextMenuItem} w-full text-left flex items-center gap-2`}
          >
            <Scissors size={14} />
            <span>Cut</span>
          </button>
        )}
        {showCopy && (
          <button
            onClick={(e) => handleAction(e, onCopy!)}
            className={`${styles.contextMenuItem} w-full text-left flex items-center gap-2`}
          >
            <Copy size={14} />
            <span>Copy</span>
          </button>
        )}
        {showPaste && (
          <button
            onClick={(e) => handleAction(e, onPaste!)}
            className={`${styles.contextMenuItem} w-full text-left flex items-center gap-2`}
          >
            <ClipboardPaste size={14} />
            <span>Paste</span>
          </button>
        )}
        {showSelectAll && (
          <button
            onClick={(e) => handleAction(e, onSelectAll!)}
            className={`${styles.contextMenuItem} w-full text-left flex items-center gap-2`}
          >
            <TextSelect size={14} />
            <span>Select All</span>
          </button>
        )}
      </div>
    </>,
    document.body
  );
};
