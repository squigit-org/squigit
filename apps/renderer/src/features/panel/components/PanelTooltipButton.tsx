/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from "react";
import { Tooltip } from "@/components/ui";

interface PanelTooltipButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip: string;
}

export const PanelTooltipButton: React.FC<PanelTooltipButtonProps> = ({
  tooltip,
  children,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onClick,
  ...buttonProps
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <>
      <button
        {...buttonProps}
        ref={buttonRef}
        onMouseEnter={(event) => {
          setShowTooltip(true);
          onMouseEnter?.(event);
        }}
        onMouseLeave={(event) => {
          setShowTooltip(false);
          onMouseLeave?.(event);
        }}
        onFocus={(event) => {
          setShowTooltip(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setShowTooltip(false);
          onBlur?.(event);
        }}
        onClick={(event) => {
          setShowTooltip(false);
          onClick?.(event);
        }}
      >
        {children}
      </button>
      <Tooltip text={tooltip} parentRef={buttonRef} show={showTooltip} above />
    </>
  );
};
