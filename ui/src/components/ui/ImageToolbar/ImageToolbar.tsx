/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import styles from "./ImageToolbar.module.css";

interface ImageToolbarProps {
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  isLensLoading?: boolean;
  onLensClick: () => void;
  onCopyImage: () => void;
  imgWrapRef: React.RefObject<HTMLDivElement | null>;
  imageHeight?: number;
}

const VERTICAL_TOOLBAR_MIN_HEIGHT = 150;

const EDGE_PADDING = 8;

interface TooltipPosition {
  top: number;
  left: number;
  visible: boolean;
  measured: boolean;
  adjustedDirection: "right" | "left" | "top" | "bottom";
  arrowOffset: number;
}

const PortalTooltip: React.FC<{
  children: React.ReactNode;
  parentRef: React.RefObject<HTMLElement | null>;
  direction?: "right" | "top";
}> = ({ children, parentRef, direction = "right" }) => {
  const [pos, setPos] = useState<TooltipPosition>({
    top: 0,
    left: 0,
    visible: false,
    measured: false,
    adjustedDirection: direction,
    arrowOffset: 0,
  });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;

    const updatePos = () => {
      const rect = parent.getBoundingClientRect();
      const tooltip = tooltipRef.current;

      const tooltipWidth = tooltip?.offsetWidth || 120;
      const tooltipHeight = tooltip?.offsetHeight || 28;
      const gap = 12;

      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      let newTop: number;
      let newLeft: number;
      let adjustedDirection: "right" | "left" | "top" | "bottom" = direction;
      let arrowOffset = 0;

      if (direction === "right") {
        // Calculate center position directly (no CSS transform needed)
        newTop = rect.top + rect.height / 2 - tooltipHeight / 2;
        newLeft = rect.right + gap;

        if (newLeft + tooltipWidth > windowWidth - EDGE_PADDING) {
          adjustedDirection = "left";
          newLeft = rect.left - gap - tooltipWidth;
        }

        if (newLeft < EDGE_PADDING) {
          newLeft = EDGE_PADDING;
        }

        const idealTop = rect.top + rect.height / 2 - tooltipHeight / 2;
        if (idealTop < EDGE_PADDING) {
          newTop = EDGE_PADDING;
          arrowOffset =
            rect.top + rect.height / 2 - (newTop + tooltipHeight / 2);
        } else if (idealTop + tooltipHeight > windowHeight - EDGE_PADDING) {
          newTop = windowHeight - EDGE_PADDING - tooltipHeight;
          arrowOffset =
            rect.top + rect.height / 2 - (newTop + tooltipHeight / 2);
        }
      } else {
        // Calculate center position directly (no CSS transform needed)
        newLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
        newTop = rect.top - gap - tooltipHeight;

        if (newTop < EDGE_PADDING) {
          adjustedDirection = "bottom";
          newTop = rect.bottom + gap;
        } else {
          adjustedDirection = "top";
        }

        const idealLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
        if (idealLeft < EDGE_PADDING) {
          newLeft = EDGE_PADDING;
          arrowOffset =
            rect.left + rect.width / 2 - (newLeft + tooltipWidth / 2);
        } else if (idealLeft + tooltipWidth > windowWidth - EDGE_PADDING) {
          newLeft = windowWidth - EDGE_PADDING - tooltipWidth;
          arrowOffset =
            rect.left + rect.width / 2 - (newLeft + tooltipWidth / 2);
        }
      }

      setPos({
        top: Math.round(newTop),
        left: Math.round(newLeft),
        visible: true,
        measured: true,
        adjustedDirection,
        arrowOffset: Math.round(arrowOffset),
      });
    };

    const handleMouseEnter = () => {
      setPos((p) => ({ ...p, visible: true, measured: false }));

      requestAnimationFrame(() => {
        updatePos();

        requestAnimationFrame(() => {
          setPos((p) => ({ ...p, measured: true }));
        });
      });
      window.addEventListener("scroll", updatePos, true);
      window.addEventListener("resize", updatePos);
    };

    const handleMouseLeave = () => {
      setPos((p) => ({ ...p, visible: false, measured: false }));
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };

    parent.addEventListener("mouseenter", handleMouseEnter);
    parent.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      parent.removeEventListener("mouseenter", handleMouseEnter);
      parent.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [parentRef, direction]);

  if (!pos.visible) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className={styles.tooltipText}
      data-direction={pos.adjustedDirection}
      style={
        {
          position: "fixed",
          top: pos.top,
          left: pos.left,
          margin: 0,
          zIndex: 9999,

          opacity: pos.measured ? 1 : 0,
          visibility: pos.measured ? "visible" : "hidden",

          "--arrow-offset": `${pos.arrowOffset}px`,
        } as React.CSSProperties
      }
    >
      {children}
    </div>,
    document.body
  );
};

const ToolbarButton: React.FC<{
  icon: React.ReactNode;
  tooltip: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  isHorizontal: boolean;
}> = ({ icon, tooltip, onClick, disabled, isHorizontal }) => {
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        className={styles.toolBtn}
        onClick={onClick}
        disabled={disabled}
      >
        {icon}
      </button>
      <PortalTooltip
        parentRef={btnRef}
        direction={isHorizontal ? "top" : "right"}
      >
        {tooltip}
      </PortalTooltip>
    </>
  );
};

export const ImageToolbar: React.FC<ImageToolbarProps> = ({
  toolbarRef,
  isLensLoading = false,
  onLensClick,
  onCopyImage,
  imgWrapRef,
  imageHeight = 0,
}) => {
  const toolbarDragRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });

  const isHorizontal = useMemo(() => {
    return imageHeight > 0 && imageHeight < VERTICAL_TOOLBAR_MIN_HEIGHT;
  }, [imageHeight]);

  const startDrag = (e: React.MouseEvent) => {
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

  useEffect(() => {
    const clampToolbarPosition = () => {
      const toolbar = toolbarRef.current;
      const wrap = imgWrapRef.current;
      if (!toolbar || !wrap) return;

      const currentLeft = parseFloat(toolbar.style.left) || 0;
      const currentTop = parseFloat(toolbar.style.top) || 0;
      if (currentLeft === 0 && currentTop === 0) return;

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
  }, [isHorizontal, toolbarRef, imgWrapRef]);

  return (
    <div
      className={`${styles.imageToolbar} ${
        isHorizontal ? styles.horizontal : ""
      }`}
      ref={toolbarRef}
    >
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

      <div className={styles.toolbarSeparator}></div>

      <ToolbarButton
        icon={
          isLensLoading ? (
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
          )
        }
        tooltip="Search with Google Lens"
        onClick={(e) => {
          e.stopPropagation();
          onLensClick();
        }}
        disabled={isLensLoading}
        isHorizontal={isHorizontal}
      />

      <ToolbarButton
        icon={
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
        }
        tooltip="Copy as Image"
        onClick={(e) => {
          e.stopPropagation();
          onCopyImage();
        }}
        isHorizontal={isHorizontal}
      />

      {/* TODO: Implement new expanded view */}
      <ToolbarButton
        icon={
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
        }
        tooltip="Expand"
        onClick={(e) => {
          e.stopPropagation();
          // TODO: Implement new expanded view
        }}
        isHorizontal={isHorizontal}
      />
    </div>
  );
};
