/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Github, ExternalLink, Mail } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { GITHUB, MAILTO } from "../../types/settings.types";
import styles from "./SupportSection.module.css";

interface SupportSectionProps {
  type: "Docs" | "Github" | "Report Bug" | "App Version";
}

const handleOpenExternalUrl = (url: string) => {
  invoke("open_external_url", { url });
};

export const SupportSection: React.FC<SupportSectionProps> = ({ type }) => {
  if (type === "Report Bug") {
    return (
      <div className={styles.sectionBlock}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Report Issues</h2>
        </div>

        <div className={styles.section}>
          <p className={styles.description}>
            Found a bug or have a suggestion? Let me know!
          </p>

          <div className={`${styles.controlRow} ${styles.supportBtnGroup}`}>
            <button
              className={`${styles.keyBtn} ${styles.actionBtn}`}
              onClick={() => handleOpenExternalUrl(MAILTO)}
            >
              <Mail size={16} /> Contact Support
            </button>

            <button
              className={`${styles.keyBtn} ${styles.actionBtn}`}
              onClick={() => handleOpenExternalUrl(GITHUB + "/issues/new")}
            >
              <Github size={16} /> Open GitHub Issue
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (type === "App Version") {
    return (
      <div className={styles.sectionBlock}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>App Version</h2>
        </div>
        <div className={styles.section}>
          <div className={styles.controlRow}>
            <span className={styles.label}>Current Version</span>
            <span className={`${styles.keyValue} ${styles.versionValue}`}>
              1.0.0
            </span>
          </div>
          <p className={`${styles.description} ${styles.upToDateMsg}`}>
            Spatialshot is up to date.
          </p>
        </div>
      </div>
    );
  }

  // Docs or Github generic
  return (
    <div className={styles.sectionBlock}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{type}</h2>
      </div>
      <div className={styles.section}>
        <p className={styles.description}>
          {type === "Docs"
            ? "Read the documentation to learn more about Spatialshot."
            : "View the source code, star the project, or contribute on GitHub."}
        </p>
        <button
          className={`${styles.keyBtn} ${styles.actionBtn}`}
          onClick={() =>
            handleOpenExternalUrl(type === "Docs" ? GITHUB : GITHUB)
          }
        >
          <ExternalLink size={16} /> Open {type}
        </button>
      </div>
    </div>
  );
};
