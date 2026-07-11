/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import styles from "./AccountSwitcher.module.css";

interface AvatarProps {
  src?: string | null;
  fallbackSrc?: string | null;
  name: string;
  size?: number | string;
  className?: string;
  onClick?: () => void;
}

const getInitials = (name: string) => {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  const first = parts[0].charAt(0);
  const last = parts[parts.length - 1].charAt(0);
  return (first + last).toUpperCase();
};

export const Avatar: React.FC<AvatarProps> = ({
  src,
  fallbackSrc,
  name,
  size,
  className = "",
  onClick,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    setImageSrc(src || fallbackSrc || null);
  }, [src, fallbackSrc]);

  const handleError = () => {
    if (imageSrc === src && fallbackSrc && fallbackSrc !== src) {
      setImageSrc(fallbackSrc);
    } else {
      setHasError(true);
    }
  };

  const initials = useMemo(() => getInitials(name), [name]);

  const style: React.CSSProperties = size ? { width: size, height: size } : {};

  return (
    <div
      className={`${styles.avatarContainer} ${className}`}
      style={style}
      onClick={onClick}
    >
      {!hasError && imageSrc ? (
        <img
          src={imageSrc}
          alt={name}
          className={styles.image}
          onError={handleError}
        />
      ) : (
        <div className={styles.fallback}>{initials}</div>
      )}
    </div>
  );
};
