/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import styles from "./SettingsTab.module.css";

interface CapturePreviewProps {
  type: "rectangular" | "squiggle";
}

export const CapturePreview: React.FC<CapturePreviewProps> = ({ type }) => {
  if (type === "rectangular") {
    return (
      <div className={styles.previewContainer}>
        <svg
          className={styles.previewSvg}
          viewBox="0 0 200 200"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Background */}
          <rect
            x="0"
            y="0"
            width="200"
            height="200"
            fill="var(--neutral-900)"
          />

          {/* Selection overlay with animated box */}
          <defs>
            <mask id="rectMask">
              <rect x="0" y="0" width="200" height="200" fill="white" />
              <rect
                className={styles.selectionBoxRect}
                x="120"
                y="40"
                rx="8"
                ry="8"
                fill="black"
              />
            </mask>
          </defs>

          {/* Dim overlay */}
          <rect
            x="0"
            y="0"
            width="200"
            height="200"
            fill="rgba(0,0,0,0.5)"
            mask="url(#rectMask)"
            className={styles.dimOverlayRect}
          />

          {/* Selection border */}
          <rect
            className={styles.selectionBorderRect}
            x="120"
            y="40"
            rx="8"
            ry="8"
            fill="none"
            stroke="var(--neutral-400)"
            strokeWidth="2"
          />

          {/* Cursor */}
          <g className={styles.cursorRect}>
            <path
              d="M0 0 L0 16 L4 12 L7 18 L9 17 L6 11 L12 11 Z"
              fill="white"
              stroke="black"
              strokeWidth="0.5"
            />
          </g>
        </svg>
      </div>
    );
  }

  return (
    <div className={styles.previewContainer}>
      <svg
        className={styles.previewSvg}
        viewBox="0 0 200 200"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background */}
        <rect x="0" y="0" width="200" height="200" fill="var(--neutral-900)" />

        {/* Dim overlay */}
        <rect
          x="0"
          y="0"
          width="200"
          height="200"
          fill="rgba(0,0,0,0.5)"
          className={styles.dimOverlayFree}
        />

        {/* Squiggle path */}
        <path
          className={styles.squigglePath}
          d="M 140,50 C 100,40 60,60 50,100 C 40,140 70,170 120,170 C 170,170 180,130 160,90 C 150,70 140,50 140,50 Z"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Cursor following the path */}
        <g className={styles.cursorFree}>
          <path
            d="M0 0 L0 16 L4 12 L7 18 L9 17 L6 11 L12 11 Z"
            fill="white"
            stroke="black"
            strokeWidth="0.5"
          />
        </g>
      </svg>
    </div>
  );
};
