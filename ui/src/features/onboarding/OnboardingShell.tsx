/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import styles from "./OnboardingShell.module.css";

interface OnboardingShellProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  allowScroll?: boolean;
  contentClassName?: string;
}

export const OnboardingShell: React.FC<OnboardingShellProps> = ({
  children,
  className,
  allowScroll,
  contentClassName,
  ...props
}) => {
  return (
    <div
      className={`${styles.container} ${allowScroll ? styles.scrollable : ""} ${className || ""}`}
      {...props}
    >
      <div
        className={`${styles.content} ${allowScroll ? styles.scrollable : ""} ${contentClassName || ""}`}
      >
        {children}
      </div>
    </div>
  );
};
