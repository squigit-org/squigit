/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { commands } from "@/platform";import { WindowCloseIcon, WindowMaximizeIcon, WindowMinimizeIcon } from "@/components/icons";
import styles from "./WindowControls.module.css";

export const WindowControls: React.FC = () => {
  const handleClose = () => commands.closeWindow();
  const handleMinimize = () => commands.minimizeWindow();
  const handleMaximize = () => commands.maximizeWindow();

  return (
    <div className={styles.windowsControls}>
      <button
        className={`${styles.windowsButton} ${styles.winMinimize}`}
        onClick={handleMinimize}
      >
        <WindowMinimizeIcon size={12} />
      </button>
      <button
        className={`${styles.windowsButton} ${styles.winMaximize}`}
        onClick={handleMaximize}
      >
        <WindowMaximizeIcon size={12} />
      </button>
      <button
        className={`${styles.windowsButton} ${styles.winClose}`}
        onClick={handleClose}
      >
        <WindowCloseIcon size={12} />
      </button>
    </div>
  );
};
