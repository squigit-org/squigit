/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Moon, Bug, Settings, Github } from "lucide-react";
import styles from "./SettingsPanel.module.css";

interface MainActionsProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onReportBug: () => void;
  onOpenGithub: () => void;
  onOpenSettingsTab: () => void;
}

export const MainActions: React.FC<MainActionsProps> = ({
  isDarkMode,
  onToggleTheme,
  onReportBug,
  onOpenGithub,
  onOpenSettingsTab,
}) => {
  return (
    <div className={styles["button-group"]}>
      <button
        className={styles["btn"]}
        id="darkModeBtn"
        onClick={onToggleTheme}
      >
        <div className={styles["btn-content"]}>
          <Moon size={18} />
          <div className={styles["btn-text"]}>Dark Mode</div>
        </div>
        <label
          className={styles["toggle"]}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            id="darkModeToggle"
            checked={isDarkMode}
            onChange={onToggleTheme}
          />
          <span className={styles["toggle-slider"]} />
        </label>
      </button>

      <button className={styles["btn"]} onClick={onReportBug}>
        <div className={styles["btn-content"]}>
          <Bug size={18} />
          <div className={styles["btn-text"]}>Report Bug</div>
        </div>
      </button>

      <button
        className={styles["btn"]}
        id="settingsBtn"
        onClick={onOpenSettingsTab}
      >
        <div className={styles["btn-content"]}>
          <Settings size={18} />
          <div className={styles["btn-text"]}>Settings</div>
        </div>
      </button>

      <button className={styles["btn"]} onClick={onOpenGithub}>
        <div className={styles["btn-content"]}>
          <Github size={18} />
          <div className={styles["btn-text"]}>GitHub Repository</div>
        </div>
      </button>
    </div>
  );
};
