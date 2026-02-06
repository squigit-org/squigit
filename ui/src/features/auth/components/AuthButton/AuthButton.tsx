/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import styles from "./AuthButton.module.css";

interface AuthButtonProps {
  onLogin: () => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

export const AuthButton: React.FC<AuthButtonProps> = ({
  onLogin,
  onCancel,
  isLoading = false,
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

  // Reset state when loading ends
  React.useEffect(() => {
    if (!isLoading) {
      setHasLeftSinceLoading(false);
    }
  }, [isLoading]);

  // Show cancel only if user has left and returned while loading
  const showCancel = isLoading && isHovered && hasLeftSinceLoading;

  return (
    <button
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`${styles.loginBtn} ${isLoading ? styles.loading : ""}`}
    >
      {isLoading &&
        (showCancel ? (
          <span style={{ fontSize: "0.8rem", color: "#666" }}>Cancel ✕</span>
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
      <span>
        {!isLoading && (
          <>
            Sign in with <span className={styles.google}>Google</span>
          </>
        )}
      </span>
    </button>
  );
};
