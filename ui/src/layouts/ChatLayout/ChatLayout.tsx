/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { TitleBar, SidePanel, AppShell } from "@/shell";
import { useShellContext } from "@/shell/context";
import styles from "./ChatLayout.module.css";

export const ChatLayout: React.FC = () => {
  const shell = useShellContext();

  return (
    <div className={styles.appContainer}>
      <TitleBar />

      <div className={styles.mainContent}>
        <div
          className={`${styles.sidePanelWrapper} ${
            !shell.isSidePanelOpen ? styles.hidden : ""
          } ${shell.enablePanelAnimation ? styles.animated : ""}`}
        >
          <SidePanel />
        </div>

        <div className={styles.contentArea}>
          <AppShell />
        </div>
      </div>
    </div>
  );
};