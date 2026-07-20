/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from "react";
import { Tooltip } from "../tooltip/Tooltip";
import styles from "./WidgetOverlay.module.css";

interface WidgetOverlayIconButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  activeClassName?: string;
  disabled?: boolean;
}

const buildClassName = ({
  isActive,
  className,
  activeClassName,
}: {
  isActive: boolean;
  className?: string;
  activeClassName?: string;
}) =>
  [
    styles.sidebarButton,
    isActive ? activeClassName || styles.active : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

export const WidgetOverlayIconButton: React.FC<
  WidgetOverlayIconButtonProps
> = ({
  icon,
  label,
  isActive = false,
  onClick,
  onMouseDown,
  className,
  activeClassName,
  disabled = false,
}) => {
  const [hover, setHover] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        className={buildClassName({ isActive, className, activeClassName })}
        aria-label={label}
        disabled={disabled}
        onClick={(event) => {
          setHover(false);
          onClick(event);
        }}
        onMouseDown={onMouseDown}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {icon}
      </button>
      <Tooltip text={label} parentRef={btnRef} show={hover && !isActive} />
    </>
  );
};

export const SidebarButtonWithTooltip = ({
  icon,
  label,
  isActive,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}) => (
  <WidgetOverlayIconButton
    icon={icon}
    label={label}
    isActive={isActive}
    onClick={onClick}
  />
);
