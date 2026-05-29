/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { platform, commands } from "@/platform";
import { github } from "@squigit/core/services/github";
import {
  prepareGitHubIssueReport,
  prepareMailReport,
} from "@squigit/core/helpers";
import { MarkGithubIcon, MailIcon, BugIcon } from "@primer/octicons-react";
import { CodeBlock } from "@/components/ui";
import { useAppContext } from "@/app/providers/AppProvider";
import packageJson from "@/../package.json";
import styles from "./HelpSettings.module.css";

export const HelpSettings: React.FC = () => {
  const app = useAppContext();
  const [sysInfo, setSysInfo] = useState<Record<string, string>>({
    [app.system.appName]: `Squigit/${packageJson.version} (Loading...)`,
    Runtime: "Loading...",
    ...(import.meta.env.VITE_PLATFORM === "electron"
      ? {}
      : { Webview: "Loading..." }),
    Commit: import.meta.env.VITE_GIT_COMMIT || "Development Mode",
  });

  useEffect(() => {
    const loadSystemData = async () => {
      try {
        const appVer = await platform.app.getVersion();
        const runtimeVer = await platform.app.getRuntimeVersion();

        let ocrVersion = "None";
        try {
          const output = await commands.runSidecarVersion(
            "squigit-ocr --version",
          );
          const match = output.match(/(\d+\.\d+\.\d+)/);
          if (match) ocrVersion = match[1];
        } catch {}

        let sttVersion = "None";
        try {
          const output = await commands.runSidecarVersion(
            "squigit-stt --version",
          );
          const match = output.match(/(\d+\.\d+\.\d+)/);
          if (match) sttVersion = match[1];
        } catch {}

        setSysInfo(() => {
          const shellName = import.meta.env.VITE_PLATFORM === "electron" ? "Electron" : "Tauri";
          const squigitAgent = `Squigit/${packageJson.version} OCR/${ocrVersion} STT/${sttVersion}`;
          const runtimeAgent = `Shell/${appVer} (${shellName}/${runtimeVer}) React/${React.version}`;
          
          const info: Record<string, string> = {
            [app.system.appName]: squigitAgent,
            Runtime: runtimeAgent,
          };

          if (import.meta.env.VITE_PLATFORM !== "electron") {
            info.Webview = navigator.userAgent;
          }

          info.Commit = import.meta.env.VITE_GIT_COMMIT || "Development Mode";

          return info;
        });
      } catch (e) {
        console.error("Failed to load system specs", e);
      }
    };
    loadSystemData();
  }, []);

  const handleOpen = (url: string) => commands.openExternalUrl(url);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy system info", err);
    }
  };

  const handleContactSupport = async () => {
    const diag = JSON.stringify(sysInfo, null, 2);
    const action = prepareMailReport(app.system.appName, {
      diagnostics: diag,
    });

    if (action.didCopy && action.copyText) {
      await copyToClipboard(action.copyText);
    }

    handleOpen(action.openUrl);
  };

  const handleReportBug = async () => {
    const diag = JSON.stringify(sysInfo, null, 2);
    const action = prepareGitHubIssueReport(app.system.appName, {
      diagnostics: diag,
    });

    if (action.didCopy && action.copyText) {
      await copyToClipboard(action.copyText);
    }

    handleOpen(action.openUrl);
  };

  return (
    <section className={styles.container} aria-labelledby="help-heading">
      <header className={styles.sectionHeader}>
        <h2 id="help-heading" className={styles.sectionTitle}>
          Help & Support
        </h2>
      </header>
      <div className={styles.code}>
        <span className={styles.subLabel}>System Diagnostics</span>
        <CodeBlock
          language="json"
          value={JSON.stringify(sysInfo, null, 2)}
          stickyHeader={false}
          style={{ maxHeight: "100px", overflowY: "auto" }}
        />
      </div>
      <div className={styles.group}>
        <div className={styles.actionRow}>
          <button
            className={styles.actionButton}
            onClick={() => handleOpen(github.repo)}
          >
            <MarkGithubIcon size={18} className={styles.actionIcon} />
            <span className={styles.actionLabel}>View Repository</span>
          </button>

          <button
            className={styles.actionButton}
            onClick={handleContactSupport}
          >
            <MailIcon size={18} className={styles.actionIcon} />
            <span className={styles.actionLabel}>Contact Support</span>
          </button>

          <button className={styles.actionButton} onClick={handleReportBug}>
            <BugIcon size={18} className={styles.actionIcon} />
            <span className={styles.actionLabel}>Report Bug</span>
          </button>
        </div>
      </div>
      <div className={styles.aboutSection}>
        <div className={styles.legalNote}>
          <p className={styles.legalNoteText}>
            Some system diagnostics information may be sent to{" "}
            {app.system.appName} when you contact support or report an issue.
            This information is used to help us troubleshoot problems and bugs,
            subject to our{" "}
            <button
              className={styles.legalLink}
              onClick={() =>
                commands.openExternalUrl(github.docs("06-policies/PRIVACY.md"))
              }
            >
              Privacy Policy and Terms.
            </button>{" "}
            We may contact you for additional details or updates regarding your
            report.
          </p>
        </div>
        <div className={styles.divider} />
        <div className={styles.legalRow}>
          <span>{app.system.appName} © 2026</span>
          <span className={styles.dot}>•</span>
          <span>
            <button
              className={`${styles.legalLink} ${styles.license}`}
              onClick={() => handleOpen(github.license)}
            >
              Licensed under Apache 2.0
            </button>
          </span>
        </div>
      </div>
    </section>
  );
};
