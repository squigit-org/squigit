/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight } from "lucide-react";
import {
  DEFAULT_MODEL_EFFORT,
  MODEL_EFFORTS,
  type ModelEffort,
} from "@squigit/core/config";
import styles from "./EffortMenu.module.css";

interface EffortMenuProps {
  effort: ModelEffort;
  onSelect: (effort: ModelEffort) => void;
  placement?: "auto" | "right-end";
  zIndex?: number;
}

export const formatEffortLabel = (effort: ModelEffort) =>
  `${effort.charAt(0).toUpperCase()}${effort.slice(1)}`;

export const EffortMenu: React.FC<EffortMenuProps> = ({
  effort,
  onSelect,
  placement = "auto",
  zIndex,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const rowRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setIsOpen(false), 100);
  }, [cancelClose]);

  const updatePosition = useCallback(() => {
    const row = rowRef.current;
    if (!row) return;

    const rowRect = row.getBoundingClientRect();
    const parentMenuRect = row
      .closest<HTMLElement>("[data-dropdown-menu]")
      ?.getBoundingClientRect();
    const anchorRect =
      placement === "right-end" && parentMenuRect
        ? parentMenuRect
        : rowRect;
    const menuRect = menuRef.current?.getBoundingClientRect();
    const menuWidth = menuRect?.width ?? 292;
    const menuHeight = menuRect?.height ?? 184;
    const gap = 8;
    const fitsRight =
      anchorRect.right + gap + menuWidth <= window.innerWidth - 8;
    const left = fitsRight
      ? anchorRect.right + gap
      : Math.max(8, anchorRect.left - menuWidth - gap);
    const preferredTop =
      placement === "right-end"
        ? anchorRect.bottom - menuHeight
        : anchorRect.top;
    const top = Math.min(
      Math.max(8, preferredTop),
      Math.max(8, window.innerHeight - menuHeight - 8),
    );
    setPosition({ top, left });
  }, [placement]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        !rowRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  const menu = isOpen ? (
    <div
      ref={menuRef}
      data-dropdown-submenu="effort"
      className={styles.sideMenu}
      style={{ top: position.top, left: position.left, zIndex }}
      role="menu"
      aria-label="Effort"
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <div className={styles.options}>
        {MODEL_EFFORTS.map((option) => (
          <button
            key={option}
            type="button"
            role="menuitemradio"
            aria-checked={effort === option}
            className={`${styles.option} ${effort === option ? styles.active : ""}`}
            onClick={() => {
              onSelect(option);
              setIsOpen(false);
            }}
          >
            <span className={styles.optionLabel}>
              <span>{formatEffortLabel(option)}</span>
              {option === DEFAULT_MODEL_EFFORT && (
                <span className={styles.defaultBadge}>default</span>
              )}
            </span>
            {effort === option && <Check size={14} />}
          </button>
        ))}
      </div>
      <p className={styles.note}>
        Higher effort require paid API keys and may experience high-demand
        spikes
      </p>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={rowRef}
        type="button"
        className={styles.parentRow}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onMouseEnter={() => {
          cancelClose();
          setIsOpen(true);
        }}
        onMouseLeave={scheduleClose}
        onFocus={() => setIsOpen(true)}
        onClick={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "Enter") {
            event.preventDefault();
            setIsOpen(true);
            window.requestAnimationFrame(() => {
              menuRef.current
                ?.querySelector<HTMLButtonElement>("button")
                ?.focus();
            });
          } else if (event.key === "Escape") {
            setIsOpen(false);
          }
        }}
      >
        <span>Effort</span>
        <span className={styles.value}>{formatEffortLabel(effort)}</span>
        <ChevronRight size={15} className={styles.chevron} />
      </button>
      {typeof document !== "undefined" && menu
        ? createPortal(menu, document.body)
        : null}
    </>
  );
};
