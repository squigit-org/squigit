/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import styles from "./ToggleSwitch.module.css";

interface ToggleSwitchProps {
  checked: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  disabled,
  ariaLabel,
  onChange,
}) => {
  return (
    <label className={styles.toggleSwitch}>
      <input
        type="checkbox"
        className={styles.toggleInput}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-checked={checked}
        aria-label={ariaLabel}
      />
      <span className={styles.toggleSlider} />
    </label>
  );
};
