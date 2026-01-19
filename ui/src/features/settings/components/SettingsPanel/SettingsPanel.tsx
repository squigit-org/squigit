/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef, useImperativeHandle } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { GITHUB, MAILTO } from "../..";
import { UserInfo, MainActions } from "../..";
import styles from "./SettingsPanel.module.css";

interface SettingsPanelProps {
  isOpen: boolean;
  isClosing: boolean;
  userName: string;
  userEmail: string;
  avatarSrc: string;
  onLogout: () => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  onOpenSettingsTab: () => void;
  toggleSettingsPanel: () => void;
}

export const SettingsPanel = forwardRef<
  { handleClose: () => Promise<boolean> },
  SettingsPanelProps
>(
  (
    {
      isOpen,
      isClosing,
      userName,
      userEmail,
      avatarSrc,
      onLogout,
      isDarkMode,
      onToggleTheme,
      onOpenSettingsTab,
      toggleSettingsPanel,
    },
    ref,
  ) => {
    const handleClose = async (): Promise<boolean> => {
      return true;
    };

    useImperativeHandle(ref, () => ({
      handleClose,
    }));

    const handleOpenExternalUrl = (url: string) => {
      invoke("open_external_url", { url });
    };

    const handleOpenSettings = () => {
      toggleSettingsPanel();
      onOpenSettingsTab();
    };

    return createPortal(
      <>
        <div
          className={styles["settings-overlay"]}
          onClick={(e) => {
            e.stopPropagation();
            toggleSettingsPanel();
          }}
        />

        <div
          className={`${styles["settings-panel"]} ${
            isOpen ? styles["active"] : ""
          } ${isClosing ? styles["closing"] : ""}`}
          id="panel"
        >
          <div className={styles["panel-content"]} id="settings-content">
            <UserInfo
              userName={userName}
              userEmail={userEmail}
              avatarSrc={avatarSrc}
              onLogout={onLogout}
            />

            <MainActions
              isDarkMode={isDarkMode}
              onToggleTheme={onToggleTheme}
              onOpenSettingsTab={handleOpenSettings}
              onReportBug={() => handleOpenExternalUrl(MAILTO)}
              onOpenGithub={() => handleOpenExternalUrl(GITHUB)}
            />
          </div>

          <div className={styles["footer"]}>
            <p>Spatialshot &copy; 2026</p>
          </div>
        </div>
      </>,
      document.body,
    );
  },
);
