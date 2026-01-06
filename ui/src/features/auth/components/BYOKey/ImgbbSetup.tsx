/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import styles from "../../layouts/AuthLayout.module.css";
import { invoke } from "@tauri-apps/api/core";

export const ImgbbSetup: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    await invoke("open_external_url", { url: "https://api.imgbb.com/" });
    await invoke("start_clipboard_watcher");
  };
  return (
    <div className={styles.viewContainer}>
      <div className={`${styles.container} ${styles.containerImgbb}`}>
        <h1 className={styles.h1}>ImgBB API Key Setup</h1>
        <p className={styles.p}>
          This is a one-time setup. The key is free and private.
        </p>
        <ul className={styles.ul}>
          <li>Click the button below.</li>
          <li>Locate "ImgBB API v1", or Add one.</li>
          <li>Click Copy. (We will detect it automatically!)</li>
        </ul>

        <button
          onClick={handleClick}
          className={`${styles.loginBtn} ${isLoading ? styles.disabled : ""}`}
        >
          {isLoading ? (
            <div className={styles.spinner}></div>
          ) : (
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 14C5.9 14 5 13.1 5 12C5 10.9 5.9 10 7 10C8.1 10 9 10.9 9 12C9 13.1 8.1 14 7 14ZM12.6 10C11.8 7.7 9.6 6 7 6C3.7 6 1 8.7 1 12C1 15.3 3.7 18 7 18C9.6 18 11.8 16.3 12.6 14H16V18H20V14H23V10H12.6Z" />
            </svg>
          )}
          <span>Sign up and get API key</span>

          <div className={styles.btnBorder}></div>
        </button>
      </div>
      <div className={styles.footer}>
        Your key stays on your device — we never see it.
      </div>
    </div>
  );
};
