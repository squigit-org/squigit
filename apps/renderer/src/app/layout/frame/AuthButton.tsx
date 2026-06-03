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
  authState?: "idle" | "redirecting" | "awaiting" | "success" | "error";
  userName?: string | null;
}

export const AuthButton: React.FC<AuthButtonProps> = ({
  onLogin,
  onCancel,
  isLoading = false,
  wizard = false,
  authState,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [hasLeftSinceLoading, setHasLeftSinceLoading] = useState(false);

  const currentLoadingState = authState === "redirecting" || isLoading;

  const handleClick = () => {
    if (authState === "error") {
      onLogin(); // Retry
      return;
    }
    if (authState === "success") {
      return;
    }
    if (authState === "awaiting") {
      return; // Do nothing
    }
    
    if (currentLoadingState && onCancel && hasLeftSinceLoading && isHovered) {
      onCancel();
    } else if (!currentLoadingState) {
      onLogin();
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (currentLoadingState) {
      setHasLeftSinceLoading(true);
    }
  };

  React.useEffect(() => {
    if (!currentLoadingState) {
      setHasLeftSinceLoading(false);
    }
  }, [currentLoadingState]);

  const showCancel = currentLoadingState && isHovered && hasLeftSinceLoading && !wizard;
  const showRetry = authState === "error" && isHovered && !wizard;

  const getButtonClass = () => {
    let cls = styles.loginBtn;
    if (wizard) cls += ` ${styles.wizardBtn}`;
    if (currentLoadingState || authState === "awaiting") cls += ` ${styles.loading}`;
    if (authState === "error") cls += ` ${styles.errorBtn}`;
    if (authState === "success") cls += ` ${styles.successBtn}`;
    if (authState === "awaiting") cls += ` ${styles.disabledBtn}`;
    return cls;
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={getButtonClass()}
      disabled={authState === "awaiting"}
    >
      {currentLoadingState &&
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

      {authState === "error" && (
        <span className={styles.errorText}>
          {showRetry ? "Retry ↻" : "An Error occured"}
        </span>
      )}

      <span className={wizard ? styles.wizardContent : ""}>
        {!currentLoadingState && authState !== "error" && (
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
