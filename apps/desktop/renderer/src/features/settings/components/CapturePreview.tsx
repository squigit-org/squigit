/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { CaptureCursorIcon, CaptureSquiggleIcon } from "@/assets";
import styles from "./CapturePreview.module.css";

interface CapturePreviewProps {
  type: "rectangular" | "squiggle";
}

export const CapturePreview: React.FC<CapturePreviewProps> = ({ type }) => {
  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        {type === "rectangular" ? (
          <>
            <div className={styles.selectionBox} />

            <div className={styles.cursorRectWrapper}>
              <div className={styles.cursorRectInner}>
                <CaptureCursorIcon className={styles.cursorSvg} />
              </div>
            </div>
          </>
        ) : (
          <>
            <CaptureSquiggleIcon
              className={styles.squiggleSvg}
              pathClassName={styles.squigglePath}
            />
            <div className={styles.cursorSquiggle}>
              <CaptureCursorIcon className={styles.cursorSvg} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
