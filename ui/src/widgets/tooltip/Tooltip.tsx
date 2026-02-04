/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "./Tooltip.module.css";

const EDGE_PADDING = 8;

interface TooltipProps {
  text: string;
  parentRef: React.RefObject<HTMLElement | null>;
  show: boolean;
  offset?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  text,
  parentRef,
  show,
  offset = 8,
}) => {
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

      let left = parentRect.right + offset;
      let top = parentRect.top + parentRect.height / 2 - tooltipRect.height / 2;

      // Handle clipping
      if (left + tooltipRect.width > windowWidth - EDGE_PADDING) {
        // Try left side
        const leftCandidate = parentRect.left - offset - tooltipRect.width;
        if (leftCandidate > EDGE_PADDING) {
          left = leftCandidate;
        } else {
          // If neither works well, default to right but clamp?
          // For now, mirroring simpler logic from ImageToolbar:
          left = parentRect.left - offset - tooltipRect.width;
        }
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
  }, [show, text, offset]);

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
