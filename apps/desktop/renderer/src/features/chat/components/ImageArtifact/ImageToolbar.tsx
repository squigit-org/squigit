/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import styles from "./ImageArtifact.module.css";

interface ImageToolbarProps {
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  isLensLoading?: boolean;
  onLensClick: () => void;
  onCopyImage: () => Promise<boolean>;
  onSaveClick: () => void;
  constraintRef: React.RefObject<HTMLDivElement | null>;
  isExpanded: boolean;
}

import { Tooltip } from "@/components";
import {
  CheckmarkIcon,
  CircularSpinnerIcon,
  CopyImageIcon,
  DragDotsIcon,
  GoogleLensIcon,
  SaveFileIcon,
} from "@/assets";

const ToolbarButton: React.FC<{
  icon: React.ReactNode;
  tooltip: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  tabIndex?: number;
}> = ({ icon, tooltip, onClick, disabled, tabIndex }) => {
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
        tabIndex={tabIndex}
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
  isExpanded,
}) => {
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const isDraggingRef = useRef(false);
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const clearCopyResetTimeout = useCallback(() => {
    if (copyResetTimeoutRef.current !== null) {
      clearTimeout(copyResetTimeoutRef.current);
      copyResetTimeoutRef.current = null;
    }
  }, []);

  const handleCopyClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      clearCopyResetTimeout();
      setCopySuccess(true);

      try {
        const success = await onCopyImage();
        if (!success) {
          setCopySuccess(false);
          return;
        }

        copyResetTimeoutRef.current = setTimeout(() => {
          setCopySuccess(false);
          copyResetTimeoutRef.current = null;
        }, 1500);
      } catch {
        setCopySuccess(false);
      }
    },
    [clearCopyResetTimeout, onCopyImage],
  );

  useEffect(() => clearCopyResetTimeout, [clearCopyResetTimeout]);

  useEffect(() => {
    if (!isExpanded) return;

    const toolbar = toolbarRef.current;
    const constraint = constraintRef.current;
    if (!toolbar || !constraint) return;

    const updatePosition = () => {
      const offsetParent = toolbar.offsetParent as HTMLElement;
      if (!offsetParent) return;

      const hasInlinePosition = !!toolbar.style.left && !!toolbar.style.top;
      if (!hasInlinePosition) {
        return;
      }

      const constraintRect = constraint.getBoundingClientRect();
      const parentRect = offsetParent.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();

      const minLeft = constraintRect.left - parentRect.left;
      const minTop = constraintRect.top - parentRect.top;

      const maxLeft = Math.max(
        minLeft,
        minLeft + constraintRect.width - toolbarRect.width,
      );
      const maxTop = Math.max(
        minTop,
        minTop + constraintRect.height - toolbarRect.height,
      );

      let currentLeft: number;
      let currentTop: number;

      currentLeft = toolbarRect.left - parentRect.left;
      currentTop = toolbarRect.top - parentRect.top;

      const newLeft = Math.max(minLeft, Math.min(currentLeft, maxLeft));
      const newTop = Math.max(minTop, Math.min(currentTop, maxTop));

      toolbar.style.left = `${newLeft}px`;
      toolbar.style.top = `${newTop}px`;
    };

    const resizeObserver = new ResizeObserver(() => {
      if (toolbar.style.left && toolbar.style.top) {
        requestAnimationFrame(updatePosition);
      }
    });

    resizeObserver.observe(constraint);
    if (toolbar.offsetParent instanceof Element) {
      resizeObserver.observe(toolbar.offsetParent);
    }

    window.addEventListener("resize", updatePosition);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [toolbarRef, constraintRef, isExpanded]);

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

  const toolbarStyle: React.CSSProperties = {
    opacity: isExpanded ? 0.98 : 0,
    visibility: isExpanded ? "visible" : "hidden",
    pointerEvents: isExpanded ? "auto" : "none",
    transition: "opacity 0.3s ease, visibility 0.3s",
  };

  const tabIndex = isExpanded ? 0 : -1;

  return (
    <div className={styles.imageToolbar} ref={toolbarRef} style={toolbarStyle}>
      <div className={styles.toolbarDrag} onMouseDown={startDrag}>
        <DragDotsIcon
          size={18}
          style={{ transform: "rotate(90deg)" }}
          color="currentColor"
        />
      </div>

      <div className={styles.toolbarSeparator}></div>

      <ToolbarButton
        icon={
          isLensLoading ? (
            <CircularSpinnerIcon size={20} className={styles.spinner} color="currentColor" />
          ) : (
            <GoogleLensIcon size={26} color="currentColor" />
          )
        }
        tooltip="Search with Google Lens"
        onClick={(e) => {
          e.stopPropagation();
          onLensClick();
        }}
        disabled={isLensLoading}
        tabIndex={tabIndex}
      />

      <ToolbarButton
        icon={
          copySuccess ? (
            <CheckmarkIcon size={18}  color="currentColor" />
          ) : (
            <CopyImageIcon size={18}  color="currentColor" />
          )
        }
        tooltip={copySuccess ? "Copied to clipboard" : "Copy as Image"}
        onClick={handleCopyClick}
        tabIndex={tabIndex}
      />

      <ToolbarButton
        icon={
          <SaveFileIcon size={18}  color="currentColor" />
        }
        tooltip="Save"
        onClick={(e) => {
          e.stopPropagation();
          onSaveClick();
        }}
        tabIndex={tabIndex}
      />
    </div>
  );
};
