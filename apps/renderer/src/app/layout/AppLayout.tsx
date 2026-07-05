/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { SidePanel } from "@/app/layout/panels/SidePanel";
import { TitleBar } from "@/app/layout/frame/TitleBar";
import styles from "./AppLayout.module.css";

type AppLayoutProps = {
  content: React.ReactNode;
  dialogs?: React.ReactNode;
  onContextMenu: React.MouseEventHandler<HTMLDivElement>;
  containerRef?: React.Ref<HTMLDivElement>;
  isSidePanelOpen: boolean;
  enablePanelAnimation: boolean;
  isWizardRoute?: boolean;
};

export const AppLayout: React.FC<AppLayoutProps> = ({
  content,
  dialogs,
  onContextMenu,
  containerRef,
  isSidePanelOpen,
  enablePanelAnimation,
  isWizardRoute,
}) => {
  return (
    <div
      ref={containerRef}
      onContextMenu={onContextMenu}
      className={`${styles.threadContainer} ${isWizardRoute ? styles.transparentBg : ""}`}
    >
      <TitleBar />
      <div className={styles.mainContent}>
        <div
          className={`
            ${styles.sidePanelWrapper}
            ${!isSidePanelOpen ? styles.hidden : ""}
            ${enablePanelAnimation ? styles.animated : ""}`}
        >
          <SidePanel />
        </div>
        <div className={styles.contentArea}>{content}</div>
      </div>
      {dialogs}
    </div>
  );
};
