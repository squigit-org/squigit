/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useRef,
  useLayoutEffect,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import styles from "./ContextMenu.module.css";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

const EDGE_PADDING = 8;
const CURSOR_OFFSET = 4;

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  children,
  width,
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

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // If menu is mounted and click is outside
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Use mousedown to capture the event before click handlers might fire/bubble
    // and potentially trigger other UI changes.
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        opacity: isPositioned ? 1 : 0,
        zIndex: 10000,
        ...(width ? { width } : {}),
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        // Optionally close on right click outside?
        // Standard behavior is often to let the new context menu handle it,
        // but for this specific component, let's keep it simple.
      }}
    >
      {children}
    </div>,
    document.body,
  );
};

interface ContextMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  variant?: "default" | "danger";
  shortcut?: string;
}

export const ContextMenuItem: React.FC<ContextMenuItemProps> = ({
  children,
  icon,
  className,
  variant = "default",
  shortcut,
  ...props
}) => {
  return (
    <button
      className={`${styles.contextMenuItem} ${variant === "danger" ? styles.danger : ""} ${className || ""}`}
      {...props}
    >
      {icon}
      {children}
      {shortcut && <span className={styles.shortcut}>{shortcut}</span>}
    </button>
  );
};

export const ContextMenuSeparator: React.FC = () => (
  <div className={styles.separator} />
);
