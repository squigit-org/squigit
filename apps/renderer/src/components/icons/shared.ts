/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CSSProperties } from "react";

export interface IconProps {
  size: number;
  className?: string;
  style?: CSSProperties;
  color?: string;
}

export interface RequiredColorIconProps {
  size: number;
  color: string;
}

export interface CloseCrossIconProps extends IconProps {
  strokeWidth?: number;
  ariaHidden?: boolean;
}

export interface SidePanelToggleIconProps extends IconProps {
  active?: boolean;
}

export interface CaptureSquiggleIconProps {
  className?: string;
  pathClassName?: string;
}

export interface OcrCircularArcIconProps {
  className?: string;
  trackClassName?: string;
  arcClassName?: string;
  strokeDasharray: string;
}

export const OCR_CIRCULAR_PATH =
  "M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831";

export function getIconSizeStyle(
  size?: number | string,
): CSSProperties | undefined {
  if (size === undefined) {
    return undefined;
  }

  return {
    width: typeof size === "number" ? `${size}px` : size,
    height: typeof size === "number" ? `${size}px` : size,
  };
}
