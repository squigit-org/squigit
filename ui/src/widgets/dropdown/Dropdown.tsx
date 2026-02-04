/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";
import styles from "./Dropdown.module.css";

interface DropdownItemProps {
  label: string;
  onClick: () => void;
  isActive?: boolean;
}

export const DropdownItem: React.FC<DropdownItemProps> = ({
  label,
  onClick,
  isActive,
}) => (
  <button
    className={`${styles.item} ${isActive ? styles.active : ""}`}
    onClick={onClick}
  >
    <span>{label}</span>
    {isActive && <Check size={14} className={styles.checkIcon} />}
  </button>
);

export const DropdownDivider: React.FC = () => (
  <div className={styles.divider} />
);

export const DropdownSectionTitle: React.FC<{ children: ReactNode }> = ({
  children,
}) => <div className={styles.sectionTitle}>{children}</div>;

interface DropdownProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  width?: number | string;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

export const Dropdown: React.FC<DropdownProps> = ({
  label,
  children,
  className = "",
  width = 200,
  isOpen: controlledOpen,
  onOpenChange,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const containerRef = useRef<HTMLDivElement>(null);

  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        handleOpenChange(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={`${styles.container} ${className}`} ref={containerRef}>
      <button
        className={`${styles.trigger} ${isOpen ? styles.active : ""}`}
        onClick={() => handleOpenChange(!isOpen)}
      >
        <span>{label}</span>
        <ChevronDown
          size={18}
          className={`${styles.chevron} ${isOpen ? styles.rotate : ""}`}
        />
      </button>

      <div
        className={`${styles.dropdown} ${isOpen ? styles.open : ""}`}
        style={{ minWidth: width }}
      >
        {children}
      </div>
    </div>
  );
};
