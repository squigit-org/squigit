/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SizedIconProps } from "./shared";

export const WindowMinimizeIcon = ({ size, className, style }: SizedIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.1"
    className={className}
    style={style}
  >
    <line x1="1" y1="6" x2="11" y2="6" />
  </svg>
);

export const WindowMaximizeIcon = ({ size, className, style }: SizedIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.1"
    className={className}
    style={style}
  >
    <rect x="1" y="1" width="10" height="10" />
  </svg>
);

export const WindowCloseIcon = ({ size, className, style }: SizedIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.1"
    className={className}
    style={style}
  >
    <line x1="1" y1="1" x2="11" y2="11" />
    <line x1="11" y1="1" x2="1" y2="11" />
  </svg>
);
