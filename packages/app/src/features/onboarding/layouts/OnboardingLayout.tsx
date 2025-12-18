/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import styles from "./OnboardingLayout.module.css";

interface OnboardingLayoutProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onPrimaryAction?: () => void;
  primaryLabel?: string;
  disablePrimary?: boolean;
  onSecondaryAction?: () => void;
  secondaryLabel?: string;
  hideHeader?: boolean;
  hideButtons?: boolean;
}

export const OnboardingLayout: React.FC<OnboardingLayoutProps> = ({
  title,
  description,
  icon,
  children,
  onPrimaryAction,
  primaryLabel = "Next",
  disablePrimary = false,
  onSecondaryAction,
  secondaryLabel = "Cancel",
  hideHeader = false,
  hideButtons = false,
}) => {
  return (
    <div className={styles.container}>
      {!hideHeader && (
        <div className={styles.header}>
          {icon && <div className={styles.iconWrapper}>{icon}</div>}
          <div className={styles.headerContent}>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.description}>{description}</p>
          </div>
        </div>
      )}

      <div className={styles.contentArea}>{children}</div>

      {!hideButtons && (
        <div className={styles.footer}>
          <div className={styles.buttonGroup}>
            {onSecondaryAction && (
              <button
                onClick={onSecondaryAction}
                className={`${styles.button} ${styles.secondaryButton}`}
              >
                {secondaryLabel}
              </button>
            )}
            <button
              onClick={onPrimaryAction}
              disabled={disablePrimary}
              className={`${styles.button} ${styles.primaryButton}`}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
