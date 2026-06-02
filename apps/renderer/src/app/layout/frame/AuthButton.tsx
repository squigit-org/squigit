/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { GoogleIcon } from "@/components/icons/brand-icons";
import styles from "./AuthButton.module.css";

interface AuthButtonProps {
  onLogin: () => void;
  onCancel?: () => void;
  isLoading?: boolean;
  wizard?: boolean;
}

export const AuthButton: React.FC<AuthButtonProps> = ({
  onLogin,
  onCancel,
  isLoading = false,
  wizard = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [hasLeftSinceLoading, setHasLeftSinceLoading] = useState(false);

  const handleClick = () => {
    if (isLoading && onCancel && hasLeftSinceLoading && isHovered) {
      onCancel();
    } else if (!isLoading) {
      onLogin();
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (isLoading) {
      setHasLeftSinceLoading(true);
    }
  };

  React.useEffect(() => {
    if (!isLoading) {
      setHasLeftSinceLoading(false);
    }
  }, [isLoading]);

  const showCancel = isLoading && isHovered && hasLeftSinceLoading;

  return (
    <button
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`${styles.loginBtn} ${wizard ? styles.wizardBtn : ""} ${isLoading ? styles.loading : ""}`}
    >
      {isLoading &&
        (showCancel ? (
          <span style={{ fontSize: "0.8rem", color: "var(--c-raw-099)" }}>
            Cancel ✕
          </span>
        ) : (
          <>
            Redirecting
            <span>
              <span className={styles.dot}>.</span>
              <span className={styles.dot}>.</span>
              <span className={styles.dot}>.</span>
            </span>
          </>
        ))}
      <span className={wizard ? styles.wizardContent : ""}>
        {!isLoading && (
          <>
            {wizard && <span className={styles.wizardIcon}><GoogleIcon size={18} /></span>}
            {wizard ? "Continue with Google" : (
              <>Sign in with <span className={styles.google}>Google</span></>
            )}
          </>
        )}
      </span>
    </button>
  );
};
