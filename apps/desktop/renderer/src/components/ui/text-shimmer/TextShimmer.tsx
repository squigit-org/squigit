/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { clsx } from "clsx";
import styles from "./TextShimmer.module.css";

interface TextShimmerProps {
  text: string;
  compact?: boolean;
  className?: string;
  duration?: number;
  spread?: number;
  spotWidth?: number;
  minSpreadPx?: number;
  angle?: number;
  peakWidth?: number;
  bleedInner?: number;
  bleedOuter?: number;
}

export const TextShimmer: React.FC<TextShimmerProps> = ({
  text,
  compact = false,
  className,
  duration = 2,
  spread = 2,
  spotWidth,
  minSpreadPx,
  angle,
  peakWidth,
  bleedInner,
  bleedOuter,
}) => {
  const spotWidthPx =
    spotWidth ??
    Math.max(text.length * spread, minSpreadPx ?? (compact ? 18 : 24));

  return (
    <div
      className={clsx(styles.container, compact && styles.compact, className)}
      aria-hidden="true"
    >
      <span
        className={styles.shimmerText}
        style={
          {
            "--text-shimmer-spot-width": `${spotWidthPx}px`,
            "--text-shimmer-duration": `${duration}s`,
            "--text-shimmer-angle": angle != null ? `${angle}deg` : undefined,
            "--text-shimmer-peak-width":
              peakWidth != null ? `${peakWidth}px` : undefined,
            "--text-shimmer-bleed-inner":
              bleedInner != null ? `${bleedInner}px` : undefined,
            "--text-shimmer-bleed-outer":
              bleedOuter != null ? `${bleedOuter}px` : undefined,
          } as React.CSSProperties
        }
      >
        {text}
      </span>
    </div>
  );
};

export default TextShimmer;
