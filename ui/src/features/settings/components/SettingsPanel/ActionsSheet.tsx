/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import styles from "./SettingsPanel.module.css";

interface MainActionsProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onClearCache: () => void;
  onReportBug: () => void;
  onResetAPIKey: () => void;
  onOpenGithub: () => void;
  onOpenSubview: () => void;
}

export const MainActions: React.FC<MainActionsProps> = ({
  isDarkMode,
  onToggleTheme,
  onClearCache,
  onReportBug,
  onResetAPIKey,
  onOpenGithub,
  onOpenSubview,
}) => {
  return (
    <div className={styles["button-group"]}>
      <button
        className={styles["btn"]}
        id="darkModeBtn"
        onClick={onToggleTheme}
      >
        <div className={styles["btn-content"]}>
          <i className="fas fa-moon" />
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

      <button
        className={styles["btn"]}
        id="clearCacheBtn"
        onClick={onClearCache}
      >
        <div className={styles["btn-content"]}>
          <i className="fas fa-broom" />
          <div className={styles["btn-text"]}>Clear Cache</div>
        </div>
      </button>

      <button className={styles["btn"]} onClick={onReportBug}>
        <div className={styles["btn-content"]}>
          <i className="fas fa-bug" />
          <div className={styles["btn-text"]}>Report Bug</div>
        </div>
      </button>

      <button
        className={styles["btn"]}
        id="resetAPIKeyBtn"
        onClick={onResetAPIKey}
      >
        <div className={styles["btn-content"]}>
          <i className="fas fa-key" />
          <div className={styles["btn-text"]}>Reset API Key</div>
        </div>
      </button>

      <button className={styles["btn"]} id="promptBtn" onClick={onOpenSubview}>
        <div className={styles["btn-content"]}>
          <i className="fas fa-edit" />
          <div className={styles["btn-text"]}>Personal Context</div>
        </div>
        <div className={styles["btn-arrow"]}>
          <i className="fas fa-chevron-right" />
        </div>
      </button>

      <button className={styles["btn"]} onClick={onOpenGithub}>
        <div className={styles["btn-content"]}>
          <i className="fab fa-github" />
          <div className={styles["btn-text"]}>GitHub Repository</div>
        </div>
      </button>
    </div>
  );
};
