/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SidePanelToggleIconProps, SizedIconProps } from "./shared";

export const SidePanelToggleIcon = ({
  size,
  className,
  style,
  active = false,
}: SidePanelToggleIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <path
      d="M9 3V21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H9Z"
      fill={active ? "currentColor" : "none"}
      stroke={active ? "none" : "currentColor"}
    />
    <line x1="9" y1="3" x2="9" y2="21" />
  </svg>
);

export const SidePanelNewThreadIcon = ({
  size,
  className,
  style,
}: SizedIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 121 118"
    fill="none"
    className={className}
    style={style}
  >
    <path
      d="M104.48 72.7959V91.8586C104.48 103.457 95.078 112.859 83.4801 112.859H25.4675C13.8696 112.859 4.46753 103.457 4.46753 91.8586V37.3047C4.46753 25.7067 13.8695 16.3047 25.4675 16.3047H47.4124"
      stroke="currentColor"
      strokeWidth="8.93484"
      strokeLinecap="round"
    />
    <path
      d="M43.1669 53.6424L81.7635 16.6424C87.9474 10.7144 97.7666 10.9223 103.695 17.1063C109.623 23.2902 109.415 33.1088 103.232 39.0369L64.7774 75.9004C61.9576 78.6034 58.3471 80.3334 54.4737 80.8374L35.8215 83.2635C34.9464 83.3772 34.2154 82.6027 34.3799 81.7356L37.8515 63.4429C38.5612 59.7029 40.4188 56.2767 43.1669 53.6424Z"
      stroke="currentColor"
      strokeWidth="8.3584"
    />
  </svg>
);

export const SidePanelSquigitsIcon = ({
  size,
  className,
  style,
}: SizedIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 138 149"
    fill="none"
    className={className}
    style={style}
  >
    <path
      d="M19.4877 37.4318L84.6124 33.8414C92.9872 33.3798 100.151 39.795 100.613 48.1698L103.748 105.039C104.21 113.414 97.7947 120.578 89.4199 121.04L24.2951 124.63C15.9203 125.092 8.75652 118.677 8.2946 110.302L5.15924 53.4324C4.69768 45.0575 11.1129 37.8937 19.4877 37.4318Z"
      stroke="currentColor"
      strokeWidth="8.20785"
    />
    <path
      d="M31.7285 25.4662L31.7285 23.3972C31.7285 11.9698 41.6062 3.04716 52.9748 4.20517L115.808 10.6054C126.407 11.685 134.125 21.1528 133.045 31.7523L126.381 97.1711C125.778 103.098 120.787 107.606 114.829 107.606"
      stroke="currentColor"
      strokeWidth="8.20785"
      strokeLinecap="round"
    />
    <path
      d="M98.5279 117.328L49.9828 74.7361C42.6208 68.2769 31.587 68.3591 24.3221 74.9275L6.88965 90.6885"
      stroke="currentColor"
      strokeWidth="8.20785"
    />
    <circle cx="73.0312" cy="59.4555" r="8.72703" fill="currentColor" />
  </svg>
);
