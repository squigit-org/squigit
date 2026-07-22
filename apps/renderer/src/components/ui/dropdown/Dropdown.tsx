/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { ChevronDown, Check } from "lucide-react";
import styles from "./Dropdown.module.css";

interface DropdownItemProps {
  label: ReactNode;
  onClick: () => void;
  isActive?: boolean;
  className?: string;
}

export const DropdownItem: React.FC<DropdownItemProps> = ({
  label,
  onClick,
  isActive,
  className,
}) => {
  const content =
    typeof label === "string" || typeof label === "number" ? (
      <span>{label}</span>
    ) : (
      label
    );

  return (
    <button
      type="button"
      className={clsx(styles.item, isActive && styles.itemActive, className)}
      onClick={onClick}
    >
      {content}
      {isActive && <Check size={14} className={styles.checkIcon} />}
    </button>
  );
};

export const DropdownDivider: React.FC = () => (
  <div className={styles.divider} />
);

export const DropdownSectionTitle: React.FC<{ children: ReactNode }> = ({
  children,
}) => <div className={styles.sectionTitle}>{children}</div>;

interface DropdownActionProps {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}

export const DropdownAction: React.FC<DropdownActionProps> = ({
  icon,
  children,
  onClick,
  className,
}) => (
  <button
    type="button"
    className={clsx(styles.actionButton, className)}
    onClick={onClick}
  >
    {icon}
    <span>{children}</span>
  </button>
);

interface DropdownProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  triggerClassName?: string;
  triggerLabelClassName?: string;
  menuClassName?: string;
  width?: number | string;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  hideChevron?: boolean;
  direction?: "up" | "down";
  align?: "left" | "right";
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  chevronSize?: number;
  offset?: number;
  portal?: boolean;
  zIndex?: number;
}

export const Dropdown: React.FC<DropdownProps> = ({
  label,
  children,
  className = "",
  triggerClassName,
  triggerLabelClassName,
  menuClassName,
  width = 200,
  isOpen: controlledOpen,
  onOpenChange,
  hideChevron = false,
  direction = "down",
  align = "right",
  disabled = false,
  title,
  ariaLabel,
  chevronSize = 18,
  offset = 8,
  portal = false,
  zIndex = 1000,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [portalStyle, setPortalStyle] = useState<CSSProperties>({});

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!isControlled) {
        setInternalOpen(newOpen);
      }
      onOpenChange?.(newOpen);
    },
    [isControlled, onOpenChange],
  );

  const updatePortalPosition = useCallback(() => {
    if (!portal || !isOpen || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const nextStyle: CSSProperties = {
      position: "fixed",
      zIndex,
    };

    if (direction === "up") {
      nextStyle.bottom = `${window.innerHeight - rect.top + offset}px`;
    } else {
      nextStyle.top = `${rect.bottom + offset}px`;
    }

    if (align === "left") {
      nextStyle.left = `${rect.left}px`;
    } else {
      nextStyle.right = `${window.innerWidth - rect.right}px`;
    }

    setPortalStyle(nextStyle);
  }, [align, direction, isOpen, offset, portal, zIndex]);

  useLayoutEffect(() => {
    if (!portal || !isOpen) return;

    updatePortalPosition();
    window.addEventListener("scroll", updatePortalPosition, true);
    window.addEventListener("resize", updatePortalPosition);

    return () => {
      window.removeEventListener("scroll", updatePortalPosition, true);
      window.removeEventListener("resize", updatePortalPosition);
    };
  }, [isOpen, portal, updatePortalPosition]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedTrigger = containerRef.current?.contains(target);
      const clickedMenu = menuRef.current?.contains(target);
      const clickedSubmenu =
        target instanceof Element && !!target.closest("[data-dropdown-submenu]");

      if (!clickedTrigger && !clickedMenu && !clickedSubmenu) {
        handleOpenChange(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [handleOpenChange, isOpen]);

  const isUp = direction === "up";

  const chevron = !hideChevron && (
    <ChevronDown
      size={chevronSize}
      className={clsx(
        styles.chevron,
        isUp && (isOpen ? styles.chevronAboveOpen : styles.chevronAboveClosed),
        !isUp && isOpen && styles.chevronOpen,
      )}
    />
  );

  const menuStyle: CSSProperties & { "--dropdown-offset": string } = {
    minWidth: width,
    "--dropdown-offset": `${offset}px`,
    ...(portal ? portalStyle : {}),
  };

  const menu = (
    <div
      ref={menuRef}
      data-dropdown-menu="true"
      className={clsx(
        styles.menu,
        isUp && styles.menuAbove,
        isOpen && styles.menuOpen,
        align === "left" ? styles.alignStart : styles.alignEnd,
        menuClassName,
      )}
      style={menuStyle}
    >
      {children}
    </div>
  );

  return (
    <div className={clsx(styles.root, className)} ref={containerRef}>
      <button
        type="button"
        className={clsx(
          styles.trigger,
          isUp ? styles.opensUp : styles.opensDown,
          triggerClassName,
        )}
        onClick={() => handleOpenChange(!isOpen)}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
      >
        {isUp && chevron}
        <span className={clsx(styles.triggerLabel, triggerLabelClassName)}>
          {label}
        </span>
        {!isUp && chevron}
      </button>

      {portal && typeof document !== "undefined"
        ? createPortal(menu, document.body)
        : menu}
    </div>
  );
};
