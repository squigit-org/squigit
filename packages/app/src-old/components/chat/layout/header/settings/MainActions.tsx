/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";

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
    <div className="button-group">
      <button className="btn" id="darkModeBtn" onClick={onToggleTheme}>
        <div className="btn-content">
          <i className="fas fa-moon" />
          <div className="btn-text">Dark Mode</div>
        </div>
        <label className="toggle" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            id="darkModeToggle"
            checked={isDarkMode}
            onChange={onToggleTheme}
          />
          <span className="toggle-slider" />
        </label>
      </button>

      <button className="btn" id="clearCacheBtn" onClick={onClearCache}>
        <div className="btn-content">
          <i className="fas fa-broom" />
          <div className="btn-text">Clear Cache</div>
        </div>
      </button>

      <button className="btn" onClick={onReportBug}>
        <div className="btn-content">
          <i className="fas fa-bug" />
          <div className="btn-text">Report Bug</div>
        </div>
      </button>

      <button className="btn" id="resetAPIKeyBtn" onClick={onResetAPIKey}>
        <div className="btn-content">
          <i className="fas fa-key" />
          <div className="btn-text">Reset API Key</div>
        </div>
      </button>

      <button className="btn" id="promptBtn" onClick={onOpenSubview}>
        <div className="btn-content">
          <i className="fas fa-edit" />
          <div className="btn-text">Personal Context</div>
        </div>
        <div className="btn-arrow">
          <i className="fas fa-chevron-right" />
        </div>
      </button>

      <button className="btn" onClick={onOpenGithub}>
        <div className="btn-content">
          <i className="fab fa-github" />
          <div className="btn-text">GitHub Repository</div>
        </div>
      </button>
    </div>
  );
};
