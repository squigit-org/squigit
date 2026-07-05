/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AppIcon } from "@/components/icons";
import { TitleBar } from "@/app/layout/frame/TitleBar";

import styles from "./SplashScreen.module.css";

type SplashScreenProps = {
  onContextMenu: React.MouseEventHandler<HTMLDivElement>;
};

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onContextMenu,
}) => {
  return (
    <div className={styles.threadContainer} onContextMenu={onContextMenu}>
      <TitleBar />
      <div className={styles.mainContent}>
        <div className={styles.loadingContent}>
          <div className={styles.logoOffset}>
            <AppIcon size={40} color="var(--c-raw-002)" />
          </div>
        </div>
      </div>
    </div>
  );
};
