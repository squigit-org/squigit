/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getName, getVersion, getTauriVersion } from "@tauri-apps/api/app";
import { GITHUB, MAILTO } from "../../types/settings.types";
import { CodeBlock, GlowCard } from "../../../../widgets";
import styles from "./SupportSection.module.css";

interface SupportSectionProps {
  type: "Help & Support";
}

const LICENSE_URL = `${GITHUB}/blob/main/LICENSE`;

export const SupportSection: React.FC<SupportSectionProps> = ({ type }) => {
  const [sysInfo, setSysInfo] = useState<Record<string, string>>({
    SnapLLM: "v1.0.0",
    Commit: "7a8657542180fb8440c8dcc20d83285fe11360ed",
    Tauri: "Loading...",
    React: React.version,
    Qt: "v6.6.0",
    PaddlePaddle: "v2.6.0",
    OS: "Loading...",
    Webview: "Loading...",
  });

  useEffect(() => {
    const loadSystemData = async () => {
      try {
        const [appName, appVer, tauriVer] = await Promise.all([
          getName(),
          getVersion(),
          getTauriVersion(),
        ]);

        setSysInfo((prev) => ({
          ...prev,
          SnapLLM: `v${appVer}`,
          Tauri: `v${tauriVer}`,
          OS: "Linux x64 6.14.0-37-generic",
          Webview: navigator.userAgent,
        }));
      } catch (e) {
        console.error("Failed to load system specs", e);
      }
    };
    loadSystemData();
  }, []);

  const handleOpen = (url: string) => invoke("open_external_url", { url });

  if (type !== "Help & Support") return null;

  return (
    <div className={styles.container}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Help & Support</h2>
      </div>

      <div className={styles.scrollContent}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.subLabel}>System Diagnostics</span>
          </div>
          <CodeBlock
            language="json"
            value={JSON.stringify(sysInfo, null, 2)}
            stickyHeader={false}
          />
          <p className={styles.noteText}>
            ➤ Include the info above in bug reports to help us fix issues
            faster.
          </p>
        </div>

        <div className={styles.linksGrid}>
          <GlowCard onClick={() => handleOpen(GITHUB)}>
            <span className={styles.actionTitle}>GitHub Repository</span>
            <span className={styles.actionDesc}>View source code & stars</span>
          </GlowCard>

          <GlowCard onClick={() => handleOpen(MAILTO)}>
            <span className={styles.actionTitle}>Contact Support</span>
            <span className={styles.actionDesc}>Send us an email</span>
          </GlowCard>

          <GlowCard
            onClick={() =>
              handleOpen(GITHUB + "/issues/new?template=bug_report.md")
            }
          >
            <span className={styles.actionTitle}>Report a Bug</span>
            <span className={styles.actionDesc}>
              Found an issue? Let us know
            </span>
          </GlowCard>
        </div>
      </div>

      <div className={styles.aboutSection}>
        <div className={styles.divider} />
        <div className={styles.legalRow}>
          <span>SnapLLM &copy; 2026</span>
          <span className={styles.dot}>•</span>
          <span>
            <button
              className={styles.licenseLink}
              onClick={() => handleOpen(LICENSE_URL)}
            >
              Licensed under Apache 2.0
            </button>
          </span>
        </div>
      </div>
    </div>
  );
};
