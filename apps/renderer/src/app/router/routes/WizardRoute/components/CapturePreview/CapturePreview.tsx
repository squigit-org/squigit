/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { CaptureCursorIcon, CaptureSquiggleIcon } from "@/components/icons";
import { Dropdown, DropdownItem, DropdownSectionTitle } from "@/components/ui";
import styles from "./CapturePreview.module.css";

interface CapturePreviewProps {
  captureType: "traditional" | "squiggle";
  onChange: (type: "traditional" | "squiggle") => void;
  direction?: "up" | "down";
  align?: "left" | "right";
}

export const CapturePreview: React.FC<CapturePreviewProps> = ({
  captureType,
  onChange,
  direction,
  align,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Dropdown
      label={captureType === "squiggle" ? "Squiggle" : "Traditional"}
      width={220}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      direction={direction}
      align={align}
    >
      <DropdownSectionTitle>Capture Type</DropdownSectionTitle>

      <div key={isOpen ? "open" : "closed"} className={styles.previewContainer}>
        <div className={styles.dropdownPreviewWrapper}>
          <div className={styles.wrapper}>
            {captureType === "traditional" ? (
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
      </div>

      <div className={styles.list}>
        <DropdownItem
          label="Traditional"
          isActive={captureType === "traditional"}
          onClick={() => onChange("traditional")}
        />
        <DropdownItem
          label="Squiggle"
          isActive={captureType === "squiggle"}
          onClick={() => onChange("squiggle")}
        />
      </div>
    </Dropdown>
  );
};
