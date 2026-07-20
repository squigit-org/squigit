/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Check } from "lucide-react";
import styles from "./PanelCheckbox.module.css";

interface PanelCheckboxProps {
  checked: boolean;
  onChange: () => void;
}

export const PanelCheckbox: React.FC<PanelCheckboxProps> = ({
  checked,
  onChange,
}) => (
  <div
    className={`${styles.checkbox} ${checked ? styles.checked : ""}`}
    onClick={(event) => {
      event.stopPropagation();
      onChange();
    }}
  >
    {checked && (
      <Check size={10} className={styles.checkboxInner} strokeWidth={4} />
    )}
  </div>
);
