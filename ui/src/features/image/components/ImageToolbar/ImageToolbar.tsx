/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import styles from "./ImageToolbar.module.css";

interface ImageToolbarProps {
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  isLensLoading?: boolean;
  onLensClick: () => void;
  onCopyImage: () => Promise<boolean>;
  onSaveClick: () => void;
  constraintRef: React.RefObject<HTMLDivElement | null>;
}

const EDGE_PADDING = 8;

const Tooltip: React.FC<{
  text: string;
  parentRef: React.RefObject<HTMLElement | null>;
  show: boolean;
}> = ({ text, parentRef, show }) => {
  const [style, setStyle] = useState<React.CSSProperties>({
    opacity: 0,
    visibility: "hidden",
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show || !parentRef.current) {
      setStyle({ opacity: 0, visibility: "hidden" });
      return;
    }

    const update = () => {
      if (!parentRef.current || !ref.current) return;
      const parentRect = parentRef.current.getBoundingClientRect();
      const tooltipRect = ref.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;

      const gap = 8;
      let left = parentRect.right + gap;
      let top = parentRect.top + parentRect.height / 2 - tooltipRect.height / 2;

      if (left + tooltipRect.width > windowWidth - EDGE_PADDING) {
        left = parentRect.left - gap - tooltipRect.width;
      }

      setStyle({
        position: "fixed",
        top: top,
        left: left,
        opacity: 1,
        visibility: "visible",
        zIndex: 9999,
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [show, text]);

  if (!show)
    return createPortal(
      <div ref={ref} className={styles.tooltipText} style={{ opacity: 0 }}>
        {text}
      </div>,
      document.body,
    );

  return createPortal(
    <div ref={ref} className={styles.tooltipText} style={style}>
      {text}
    </div>,
    document.body,
  );
};

const ToolbarButton: React.FC<{
  icon: React.ReactNode;
  tooltip: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
}> = ({ icon, tooltip, onClick, disabled }) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);

  return (
    <>
      <button
        ref={btnRef}
        className={styles.toolBtn}
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {icon}
      </button>
      <Tooltip text={tooltip} parentRef={btnRef} show={hover} />
    </>
  );
};

export const ImageToolbar: React.FC<ImageToolbarProps> = ({
  toolbarRef,
  isLensLoading = false,
  onLensClick,
  onCopyImage,
  onSaveClick,
  constraintRef,
}) => {
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const isDraggingRef = useRef(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopyClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const success = await onCopyImage();
      if (success) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 1500);
      }
    },
    [onCopyImage],
  );

  useEffect(() => {
    const toolbar = toolbarRef.current;
    const constraint = constraintRef.current;
    if (!toolbar || !constraint) return;

    const offsetParent = toolbar.offsetParent as HTMLElement;
    if (!offsetParent) return;

    const constraintRect = constraint.getBoundingClientRect();
    const parentRect = offsetParent.getBoundingClientRect();

    const initialLeft = constraintRect.left - parentRect.left + 8;
    const initialTop = constraintRect.top - parentRect.top + 8;

    toolbar.style.left = `${initialLeft}px`;
    toolbar.style.top = `${initialTop}px`;
  }, [toolbarRef, constraintRef]);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const toolbar = toolbarRef.current;
    const constraint = constraintRef.current;
    if (!toolbar || !constraint) return;

    isDraggingRef.current = true;
    dragStartRef.current.x = e.clientX;
    dragStartRef.current.y = e.clientY;

    const offsetParent = toolbar.offsetParent as HTMLElement;
    if (!offsetParent) return;

    const toolbarRect = toolbar.getBoundingClientRect();
    const parentRect = offsetParent.getBoundingClientRect();

    const currentLeft = toolbarRect.left - parentRect.left;
    const currentTop = toolbarRect.top - parentRect.top;

    dragStartRef.current.left = currentLeft;
    dragStartRef.current.top = currentTop;

    document.addEventListener("mousemove", handleDrag);
    document.addEventListener("mouseup", stopDrag);
  };

  const handleDrag = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();

    const toolbar = toolbarRef.current;
    const constraint = constraintRef.current;
    const offsetParent = toolbar?.offsetParent as HTMLElement;

    if (!toolbar || !constraint || !offsetParent) return;

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    let newLeft = dragStartRef.current.left + deltaX;
    let newTop = dragStartRef.current.top + deltaY;

    const constraintRect = constraint.getBoundingClientRect();
    const parentRect = offsetParent.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();

    const minLeft = constraintRect.left - parentRect.left;
    const minTop = constraintRect.top - parentRect.top;
    const maxLeft =
      constraintRect.left -
      parentRect.left +
      constraintRect.width -
      toolbarRect.width;
    const maxTop =
      constraintRect.top -
      parentRect.top +
      constraintRect.height -
      toolbarRect.height;

    newLeft = Math.max(minLeft, Math.min(newLeft, maxLeft));
    newTop = Math.max(minTop, Math.min(newTop, maxTop));

    toolbar.style.left = `${newLeft}px`;
    toolbar.style.top = `${newTop}px`;
  };

  const stopDrag = () => {
    isDraggingRef.current = false;
    document.removeEventListener("mousemove", handleDrag);
    document.removeEventListener("mouseup", stopDrag);
  };

  return (
    <div className={styles.imageToolbar} ref={toolbarRef}>
      <div className={styles.toolbarDrag} onMouseDown={startDrag}>
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
      />

      <ToolbarButton
        icon={
          copySuccess ? (
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
              <polyline points="20 6 9 17 4 12" />
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
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
          )
        }
        tooltip={copySuccess ? "Copied to clipboard" : "Copy as Image"}
        onClick={handleCopyClick}
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
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
        }
        tooltip="Save"
        onClick={(e) => {
          e.stopPropagation();
          onSaveClick();
        }}
      />
    </div>
  );
};
