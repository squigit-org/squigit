/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from "react";

interface ImageToolbarProps {
  toolbarRef: React.RefObject<HTMLDivElement>;
  isFullscreen: boolean;
  isLensLoading?: boolean;
  onLensClick: () => void;
  onCopyImage: () => void;
  onToggleFullscreen: (e: React.MouseEvent) => void;
  imgWrapRef: React.RefObject<HTMLDivElement>;
}

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
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });

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

    toolbar.style.right = "auto";
    toolbar.style.bottom = "auto";
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
    newTop = Math.max(0, Math.min(newTop, maxTop));

    toolbar.style.left = `${newLeft}px`;
    toolbar.style.top = `${newTop}px`;
  };

  const stopDrag = () => {
    isDraggingRef.current = false;
    document.removeEventListener("mousemove", handleDrag);
    document.removeEventListener("mouseup", stopDrag);
  };

  return (
    <div className="image-toolbar" ref={toolbarRef}>
      <div
        className="toolbar-drag"
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
          style={{ transform: "rotate(90deg)" }}
        >
          <path d="M7 19c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7 3c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM17 19c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM17 3c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM17 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      </div>

      <div className="toolbar-separator"></div>

      <button
        className="tool-btn"
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
            className="spinner"
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
        <span className="tooltip-text">Search with Google Lens</span>
      </button>

      <button
        className="tool-btn"
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
        <span className="tooltip-text">Copy as Image</span>
      </button>

      <button className="tool-btn" onClick={onToggleFullscreen}>
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
        <span className="tooltip-text">
          {isFullscreen ? "Collapse" : "Expand"}
        </span>
      </button>
    </div>
  );
};
