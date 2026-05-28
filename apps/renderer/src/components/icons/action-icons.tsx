/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CloseCrossIconProps, SizedIconProps } from "./shared";

export const CloseCrossIcon = ({
  size,
  className,
  style,
  strokeWidth = 3,
  ariaHidden = false,
}: CloseCrossIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden={ariaHidden}
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const DragDotsIcon = ({ size, className, style }: SizedIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    style={style}
  >
    <path d="M7 19c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7 3c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM17 19c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM17 3c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM17 11c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
  </svg>
);

export const CircularSpinnerIcon = ({
  size,
  className,
  style,
  color,
}: SizedIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export const CheckmarkIcon = ({ size, className, style, color }: SizedIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const CopyImageIcon = ({ size, className, style, color }: SizedIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 17 17"
    fill={color ?? "currentColor"}
    className={className}
    style={style}
  >
    <path fillRule="evenodd" clipRule="evenodd" d="M13 0C15.2091 0 17 1.79086 17 4V9C17 11.14 15.3194 12.8879 13.2061 12.9951L13 13C13 15.2091 11.2091 17 9 17H4L3.79395 16.9951C1.68056 16.8879 0 15.14 0 13V8C0 5.79086 1.79086 4 4 4C4 1.79086 5.79086 8.0532e-08 8 0H13ZM4 6C2.89543 6 2 6.89543 2 8V13C2 14.1046 2.89543 15 4 15H9C10.1046 15 11 14.1046 11 13V8C11 6.89543 10.1046 6 9 6H4ZM8 2C6.89543 2 6 2.89543 6 4H9C11.2091 4 13 5.79086 13 8V11C14.1046 11 15 10.1046 15 9V4C15 2.89543 14.1046 2 13 2H8Z" />
  </svg>
);

export const SaveFileIcon = ({ size, className, style, color }: SizedIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 17"
    fill={color ?? "currentColor"}
    className={className}
    style={style}
  >
    <path d="M15.1123 11.5596C15.6006 11.5596 16 11.9557 16 12.4473V14.2256C15.9998 15.6967 14.8085 16.8906 13.334 16.8906H2.66602C1.19482 16.8906 0.000233216 15.7 0 14.2256V12.4473C0 11.9558 0.402422 11.5596 0.890625 11.5596C1.37887 11.5596 1.77832 11.9557 1.77832 12.4473V14.2256C1.77855 14.7136 2.17461 15.1123 2.66602 15.1123H13.3379C13.8259 15.1122 14.2254 14.7169 14.2256 14.2256V12.4473C14.2256 11.9591 14.6209 11.5597 15.1123 11.5596ZM8 0C8.49155 0 8.8877 0.399448 8.8877 0.887695V9.85547L11.8174 6.92969C12.1638 6.58013 12.7279 6.58004 13.0742 6.92969C13.4203 7.27606 13.4204 7.84022 13.0742 8.18652L8.62695 12.6299C8.28056 12.9763 7.71651 12.9763 7.37012 12.6299L2.92578 8.18262C2.57983 7.83619 2.57954 7.27203 2.92578 6.92578C3.27203 6.57954 3.83619 6.57983 4.18262 6.92578L7.1123 9.85547V0.887695C7.1123 0.399448 7.50845 1.03261e-06 8 0Z" />
  </svg>
);
