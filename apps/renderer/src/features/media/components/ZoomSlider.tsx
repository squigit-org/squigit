/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import styles from "./ZoomSlider.module.css";

interface ZoomSliderProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

export const ZoomSlider: React.FC<ZoomSliderProps> = ({
  value,
  onChange,
  className,
}) => {
  const clampedValue = Math.min(1, Math.max(0, value));
  const rootClassName = className
    ? `${styles.zoomSlider} ${className}`
    : styles.zoomSlider;

  return (
    <div className={rootClassName}>
      <ZoomOut className={styles.zoomIcon} size={19} aria-hidden="true" />
      <input
        className={styles.range}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={clampedValue}
        aria-label="Zoom"
        style={
          {
            "--zoom-progress": `${clampedValue * 100}%`,
          } as React.CSSProperties
        }
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <ZoomIn className={styles.zoomIcon} size={19} aria-hidden="true" />
    </div>
  );
};
