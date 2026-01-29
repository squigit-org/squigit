/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Github, Mail, Star, Terminal } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { getName, getVersion, getTauriVersion } from "@tauri-apps/api/app";
// import { type, arch, version } from "@tauri-apps/api/os";
import { GITHUB, MAILTO } from "../../types/settings.types";
import { CodeBlock } from "../../../syntax";
import styles from "./SupportSection.module.css";

interface SupportSectionProps {
  type: "Help & Support";
}

export const SupportSection: React.FC<SupportSectionProps> = ({ type }) => {
  const [sysInfo, setSysInfo] = useState<Record<string, string>>({
    SpatialShot: "v1.0.0",
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
        const [appName, appVer, tauriVer /*, osType, osArch, osVer*/] =
          await Promise.all([
            getName(),
            getVersion(),
            getTauriVersion(),
            // type(),
            // arch(),
            // version(),
          ]);

        setSysInfo((prev) => ({
          ...prev,
          SpatialShot: `v${appVer}`,
          Tauri: `v${tauriVer}`,
          OS: "Linux x64 6.14.0-37-generic", //`${osType} ${osArch} ${osVer}`,
          Webview: navigator.userAgent, // Best guess from browser side
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
      {/* HEADER */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Help & Support</h2>
      </div>

      {/* SECTION 1: SYSTEM DIAGNOSTICS */}
      <div className={styles.section}>
        <CodeBlock
          language="json"
          value={JSON.stringify(sysInfo, null, 2)}
          stickyHeader={false}
        />

        <div className={styles.actionRow}>
          <p className={styles.noteText}>
            ⚙ Include the system info above in your bug report to help us fix
            issues faster.
          </p>
        </div>
      </div>

      <div className={styles.linksGrid}>
        <button className={styles.linkBtn} onClick={() => handleOpen(GITHUB)}>
          GitHub
        </button>

        <button className={styles.linkBtn} onClick={() => handleOpen(MAILTO)}>
          Email Us
        </button>
        <button
          className={styles.linkBtn}
          onClick={() =>
            handleOpen(GITHUB + "/issues/new?template=bug_report.md")
          }
        >
          Report Bug
        </button>
      </div>
    </div>
  );
};
