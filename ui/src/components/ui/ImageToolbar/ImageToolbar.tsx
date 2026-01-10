/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useMemo } from "react";
import styles from "./ImageToolbar.module.css";

interface ImageToolbarProps {
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  isFullscreen: boolean;
  isLensLoading?: boolean;
  onLensClick: () => void;
  onCopyImage: () => void;
  onToggleFullscreen: (e: React.MouseEvent) => void;
  imgWrapRef: React.RefObject<HTMLDivElement | null>;
  isTransitioning?: boolean;
  imageHeight?: number;
}

// Toolbar dimensions for layout calculation
// Vertical toolbar height: 4 buttons * 28px + gaps + padding ≈ 150px
// If image height < this value, switch to horizontal layout
const VERTICAL_TOOLBAR_MIN_HEIGHT = 150;

export const ImageToolbar: React.FC<ImageToolbarProps> = ({
  toolbarRef,
  isFullscreen,
  isLensLoading = false,
  onLensClick,
  onCopyImage,
  onToggleFullscreen,
  imgWrapRef,
  isTransitioning = false,
  imageHeight = 0,
}) => {
  const toolbarDragRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });

  // Determine layout mode based on image height
  // If image is too short for vertical toolbar, switch to horizontal
  const isHorizontal = useMemo(() => {
    return imageHeight > 0 && imageHeight < VERTICAL_TOOLBAR_MIN_HEIGHT;
  }, [imageHeight]);

  const startDrag = (e: React.MouseEvent) => {
    // Disable dragging in fullscreen mode
    if (isFullscreen) return;

    e.preventDefault();
    e.stopPropagation();

    const toolbar = toolbarRef.current;
    const wrap = imgWrapRef.current;
    if (!toolbar || !wrap) return;

    isDraggingRef.current = true;
    dragStartRef.current.x = e.clientX;
    dragStartRef.current.y = e.clientY;

    const wrapRect = wrap.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();

    const offsetLeft = toolbarRect.left - wrapRect.left;
    const offsetTop = toolbarRect.top - wrapRect.top;

    toolbar.style.left = `${offsetLeft}px`;
    toolbar.style.top = `${offsetTop}px`;

    dragStartRef.current.left = offsetLeft;
    dragStartRef.current.top = offsetTop;

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
    const deltaY = e.clientY - dragStartRef.current.y;

    let newLeft = dragStartRef.current.left + deltaX;
    let newTop = dragStartRef.current.top + deltaY;

    const wrapRect = wrap.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();

    const maxLeft = wrapRect.width - toolbarRect.width;
    const maxTop = wrapRect.height - toolbarRect.height;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));

    // In horizontal mode, only move on X axis (Y stays fixed via CSS)
    // In vertical mode, allow full 2D movement
    if (!isHorizontal) {
      newTop = Math.max(0, Math.min(newTop, maxTop));
      toolbar.style.top = `${newTop}px`;
    }

    toolbar.style.left = `${newLeft}px`;
  };

  const stopDrag = () => {
    isDraggingRef.current = false;
    document.removeEventListener("mousemove", handleDrag);
    document.removeEventListener("mouseup", stopDrag);
  };

  // Clamp toolbar position when window resizes
  useEffect(() => {
    if (isFullscreen) return;

    const clampToolbarPosition = () => {
      const toolbar = toolbarRef.current;
      const wrap = imgWrapRef.current;
      if (!toolbar || !wrap) return;

      const currentLeft = parseFloat(toolbar.style.left) || 0;
      const currentTop = parseFloat(toolbar.style.top) || 0;
      if (currentLeft === 0 && currentTop === 0) return; // Not dragged, skip

      const wrapWidth = wrap.clientWidth;
      const wrapHeight = wrap.clientHeight;
      const toolbarWidth = toolbar.offsetWidth;
      const toolbarHeight = toolbar.offsetHeight;
      const maxLeft = wrapWidth - toolbarWidth;
      const maxTop = wrapHeight - toolbarHeight;

      if (currentLeft > maxLeft) {
        toolbar.style.left = `${Math.max(0, maxLeft)}px`;
      }
      if (currentTop > maxTop) {
        toolbar.style.top = `${Math.max(0, maxTop)}px`;
      }
    };

    window.addEventListener("resize", clampToolbarPosition);
    return () => window.removeEventListener("resize", clampToolbarPosition);
  }, [isFullscreen, isHorizontal, toolbarRef, imgWrapRef]);

  // Interaction lock to prevent sticky hover states after transition
  const [isInteractionLocked, setIsInteractionLocked] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (isTransitioning) {
      setIsInteractionLocked(true);
    }
  }, [isTransitioning]);

  useEffect(() => {
    if (!isInteractionLocked) return;

    let moveCount = 0;
    const handleMouseMove = (e: MouseEvent) => {
      // Require consecutive moves or a larger distance to unlock
      // This prevents "jitter" or immediate firing on transition end
      const dx = Math.abs(e.clientX - lastMousePos.current.x);
      const dy = Math.abs(e.clientY - lastMousePos.current.y);

      // Ignore microscopic movements
      if (dx < 3 && dy < 3) {
        return;
      }

      moveCount++;
      // Only unlock after a consistent movement pattern (2 events) or significant distance
      if (moveCount > 1 || dx > 5 || dy > 5) {
        setIsInteractionLocked(false);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
    };

    lastMousePos.current = { x: 0, y: 0 };
    window.addEventListener("mousemove", handleMouseMove, { capture: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove, {
        capture: true,
      });
    };
  }, [isInteractionLocked]);

  return (
    <div
      className={`${styles.imageToolbar} ${
        isInteractionLocked ? styles.interactionLocked : ""
      } ${isHorizontal ? styles.horizontal : ""}`}
      ref={toolbarRef}
      style={{
        ...(isInteractionLocked ? { pointerEvents: "none" } : {}),
        ...(isTransitioning ? { opacity: 0, pointerEvents: "none" } : {}),
      }}
    >
      {/* Show drag handle when not in fullscreen */}
      {!isFullscreen && (
        <div
          className={styles.toolbarDrag}
          ref={toolbarDragRef}
          onMouseDown={startDrag}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ transform: "rotate(90deg)" }}
          >
            <path d="M7 19c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7 3c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM17 19c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM17 3c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM17 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        </div>
      )}

      {/* Only show these buttons when not in fullscreen */}
      {!isFullscreen && (
        <>
          <div className={styles.toolbarSeparator}></div>

          <button
            className={styles.toolBtn}
            onClick={(e) => {
              e.stopPropagation();
              onLensClick();
            }}
            disabled={isLensLoading}
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
        </>
      )}

      <button className={styles.toolBtn} onClick={onToggleFullscreen}>
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
