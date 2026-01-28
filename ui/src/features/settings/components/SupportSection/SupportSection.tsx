/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  Github,
  ExternalLink,
  Mail,
  RefreshCw,
  Info,
  Star,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { GITHUB, MAILTO } from "../../types/settings.types";
import styles from "./SupportSection.module.css";

interface SupportSectionProps {
  type: "Help & Support";
}

const handleOpenExternalUrl = (url: string) => {
  invoke("open_external_url", { url });
};

export const SupportSection: React.FC<SupportSectionProps> = ({ type }) => {
  if (type === "Help & Support") {
    return (
      <div>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Help & Support</h2>
        </div>

        {/* About & Version */}
        <div className={styles.section}>
          <div className={styles.controlRow}>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <Info size={18} color="var(--neutral-400)" />
              <span className={styles.label} style={{ marginBottom: 0 }}>
                Spatialshot
              </span>
            </div>
            <span className={`${styles.keyValue} ${styles.versionValue}`}>
              v1.0.0
            </span>
          </div>
          <p
            className={styles.description}
            style={{ marginTop: "0.5rem", marginBottom: 0 }}
          >
            A powerful screenshot tool for developers.
          </p>
        </div>

        {/* Update Checker */}
        <div className={styles.section}>
          <div className={styles.controlRow}>
            <span className={styles.label} style={{ marginBottom: 0 }}>
              Updates
            </span>
            <button
              className={`${styles.keyBtn} ${styles.actionBtn}`}
              onClick={() => {
                /* Placeholder for update check */
              }}
            >
              <RefreshCw size={14} /> Check for Updates
            </button>
          </div>
          <p
            className={`${styles.description} ${styles.upToDateMsg}`}
            style={{ marginTop: "0.5rem", marginBottom: 0 }}
          >
            You are on the latest version.
          </p>
        </div>

        {/* Feedback */}
        <div className={styles.section}>
          <div className={styles.controlRow}>
            <span className={styles.label} style={{ marginBottom: 0 }}>
              Feedback
            </span>
            <button
              className={`${styles.keyBtn} ${styles.actionBtn}`}
              onClick={() => handleOpenExternalUrl(GITHUB)} // Redirect to repo or specific feedback form
            >
              <Star size={14} /> Rate Spatialshot
            </button>
          </div>
          <p
            className={styles.description}
            style={{ marginTop: "0.5rem", marginBottom: 0 }}
          >
            Enjoying the app? Give us a star or rating!
          </p>
        </div>

        {/* Report Issues */}
        <div className={styles.section}>
          <p className={styles.label}>Report Issues</p>
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
              onClick={() =>
                handleOpenExternalUrl(
                  GITHUB + "/issues/new?template=bug_report.md",
                )
              }
            >
              <Github size={16} /> Open GitHub Issue
            </button>
          </div>
        </div>
      </div>
    );
  }
  return null;
};
