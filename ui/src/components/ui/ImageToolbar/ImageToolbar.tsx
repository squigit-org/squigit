/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useCallback } from "react";
import styles from "./ImageToolbar.module.css";

interface ImageToolbarProps {
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
  isLensLoading?: boolean;
  onLensClick: () => void;
  onCopyImage: () => void;
  onToggleFullscreen: (e: React.MouseEvent) => void;
  imgWrapRef: React.RefObject<HTMLDivElement | null>;
}

const EDGE_PADDING = 10;

export const ImageToolbar: React.FC<ImageToolbarProps> = ({
  toolbarRef,
  isFullscreen,
  isLensLoading = false,
  onLensClick,
  onCopyImage,
  onToggleFullscreen,
  imgWrapRef,
}) => {
  const toolbarDragRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, left: 0 });

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const toolbar = toolbarRef.current;
    const wrap = imgWrapRef.current;
    if (!toolbar || !wrap) return;

    isDraggingRef.current = true;
    dragStartRef.current.x = e.clientX;

    const wrapRect = wrap.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();

    const offsetLeft = toolbarRect.left - wrapRect.left;

    toolbar.style.left = `${offsetLeft}px`;

    dragStartRef.current.left = offsetLeft;

    document.addEventListener("mousemove", handleDrag);
    document.addEventListener("mouseup", stopDrag);
  };

  const handleDrag = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();

    const toolbar = toolbarRef.current;
    const wrap = imgWrapRef.current;
    if (!toolbar || !wrap) return;

    const deltaX = e.clientX - dragStartRef.current.x;

    let newLeft = dragStartRef.current.left + deltaX;

    const wrapRect = wrap.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();

    const maxLeft = wrapRect.width - toolbarRect.width;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));

    toolbar.style.left = `${newLeft}px`;
  };

  const stopDrag = () => {
    isDraggingRef.current = false;
    document.removeEventListener("mousemove", handleDrag);
    document.removeEventListener("mouseup", stopDrag);
  };

  // Handle tooltip positioning on button hover - dynamically adjusts for edge overflow
  const handleButtonMouseEnter = useCallback((e: React.MouseEvent) => {
    const button = e.currentTarget as HTMLElement;
    const tooltip = button.querySelector(
      `.${styles.tooltipText}`
    ) as HTMLElement;
    if (!tooltip) return;

    const buttonRect = button.getBoundingClientRect();
    const buttonCenterX = buttonRect.left + buttonRect.width / 2;

    // Temporarily show tooltip to measure its width
    const origDisplay = tooltip.style.display;
    tooltip.style.visibility = "hidden";
    tooltip.style.display = "block";
    tooltip.style.opacity = "0";
    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.style.display = origDisplay;
    tooltip.style.visibility = "";
    tooltip.style.opacity = "";

    const tooltipHalfWidth = tooltipRect.width / 2;
    const viewportWidth = window.innerWidth;

    // Default centered position
    let tooltipLeft = "50%";
    let tooltipTranslate = "-50%";
    let notchLeft = "50%";

    const leftEdge = buttonCenterX - tooltipHalfWidth;
    const rightEdge = buttonCenterX + tooltipHalfWidth;

    if (leftEdge < EDGE_PADDING) {
      // Tooltip overflows left - shift right to keep 10px from left edge
      const shiftRight = EDGE_PADDING - leftEdge;
      tooltipLeft = `calc(50% + ${shiftRight}px)`;
      notchLeft = `calc(50% - ${shiftRight}px)`;
    } else if (rightEdge > viewportWidth - EDGE_PADDING) {
      // Tooltip overflows right - shift left to keep 10px from right edge
      const shiftLeft = rightEdge - (viewportWidth - EDGE_PADDING);
      tooltipLeft = `calc(50% - ${shiftLeft}px)`;
      notchLeft = `calc(50% + ${shiftLeft}px)`;
    }

    tooltip.style.setProperty("--tooltip-left", tooltipLeft);
    tooltip.style.setProperty("--tooltip-translate", tooltipTranslate);
    tooltip.style.setProperty("--notch-left", notchLeft);
  }, []);

  return (
    <div className={styles.imageToolbar} ref={toolbarRef}>
      <div
        className={styles.toolbarDrag}
        ref={toolbarDragRef}
        onMouseDown={startDrag}
        title="Drag"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ transform: "rotate(0deg)" }}
        >
          <path d="M7 19c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7 3c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM17 19c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM17 3c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM17 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      </div>

      <div className={styles.toolbarSeparator}></div>

      <button
        className={styles.toolBtn}
        onClick={(e) => {
          e.stopPropagation();
          onLensClick();
        }}
        disabled={isLensLoading}
        onMouseEnter={handleButtonMouseEnter}
      >
        {isLensLoading ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.spinner}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
        )}
        <span className={styles.tooltipText}>Search with Google Lens</span>
      </button>

      <button
        className={styles.toolBtn}
        onClick={(e) => {
          e.stopPropagation();
          onCopyImage();
        }}
        onMouseEnter={handleButtonMouseEnter}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
        <span className={styles.tooltipText}>Copy as Image</span>
      </button>

      <button
        className={styles.toolBtn}
        onClick={onToggleFullscreen}
        onMouseEnter={handleButtonMouseEnter}
      >
        {isFullscreen ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: "scaleX(-1)" }}
          >
            <path d="M10 4v6H4" />
            <path d="M14 20v-6h6" />
          </svg>
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: "scaleX(-1)" }}
          >
            <path d="M4 10V4h6" />
            <path d="M20 14v6h-6" />
          </svg>
        )}
        <span className={styles.tooltipText}>
          {isFullscreen ? "Collapse" : "Expand"}
        </span>
      </button>
    </div>
  );
};
