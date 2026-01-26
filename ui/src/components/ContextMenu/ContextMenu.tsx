/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useLayoutEffect, useState, ReactNode } from "react";
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

  return createPortal(
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
        }}
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
      >
        {children}
      </div>
    </>,
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
