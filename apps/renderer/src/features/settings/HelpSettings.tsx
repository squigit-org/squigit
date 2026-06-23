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
import {
  MarkGithubIcon,
  MailIcon,
  BugIcon,
  CopyIcon,
  CheckIcon,
  ChevronRightIcon,
} from "@primer/octicons-react";
import { useAppContext } from "@/app/providers/AppProvider";
import packageJson from "@/../package.json";
import styles from "./HelpSettings.module.css";

/**
 * The diagnostics object (`sysInfo`) keeps the compact agent-string syntax that
 * the bug/support reports depend on. For display we filter that syntax into
 * human-readable rows, merging related fields (OS+arch, OCR+STT) so the card
 * reads cleanly. Parsing the strings here (instead of in the loader) keeps the
 * report payload untouched.
 */
type Spec = { label: string; value: string; mono?: boolean; muted?: boolean };

// "{os}/{arch} ({display}) {pkg}" e.g. "macOS 15.2/aarch64 (Aqua) brew". We
// only surface os + arch; the display server and package manager stay in the
// raw report but aren't worth a row in the card.
const MACHINE_RE = /^(.+)\/(\S+)\s+\([^)]+\)\s+\S+$/;
const VERSION_TOKEN = /([A-Za-z][\w.-]*)\/([\w.\-+]+)/g;

/**
 * Flatten the compact agent-string syntax into a name -> version map (plus the
 * parsed machine fields) so rows can be recomposed and merged.
 */
const collectValues = (
  info: Record<string, string>,
  appName: string,
): Record<string, string> => {
  const v: Record<string, string> = {};

  for (const [key, raw] of Object.entries(info)) {
    if (key === appName || key === "Runtime") {
      for (const [, name, version] of raw.matchAll(VERSION_TOKEN)) {
        v[name] = version;
      }
    } else if (key === "Machine") {
      const m = raw.match(MACHINE_RE);
      if (m) {
        v.OS = m[1];
        v.Arch = m[2];
      } else {
        v.Machine = raw;
      }
    } else {
      v[key] = raw; // Commit, Webview user-agent, etc.
    }
  }

  return v;
};

/** Split diagnostics into an always-visible summary and expandable details. */
const buildSpecs = (
  info: Record<string, string>,
  appName: string,
): { summary: Spec[]; details: Spec[] } => {
  const v = collectValues(info, appName);
  const ver = (x: string) => (x === "None" ? "—" : `v${x}`);

  const summary: Spec[] = [];
  if (v[appName]) summary.push({ label: appName, value: `v${v[appName]}` });
  if (v.OS)
    summary.push({
      label: "System",
      value: v.Arch ? `${v.OS} (${v.Arch})` : v.OS,
    });
  const runtime = v.Electron
    ? `Electron v${v.Electron}`
    : v.Tauri
      ? `Tauri v${v.Tauri}`
      : undefined;
  if (runtime) summary.push({ label: "Runtime", value: runtime });

  const details: Spec[] = [];

  // Merge the OCR/STT sidecar versions into a single row.
  if (v.OCR !== undefined || v.STT !== undefined) {
    const installed = Boolean(
      (v.OCR && v.OCR !== "None") || (v.STT && v.STT !== "None"),
    );
    const parts: string[] = [];
    if (v.OCR !== undefined) parts.push(`OCR ${ver(v.OCR)}`);
    if (v.STT !== undefined) parts.push(`STT ${ver(v.STT)}`);
    details.push({
      label: "Engines",
      value: installed ? parts.join(" · ") : "Not installed",
      muted: !installed,
    });
  }

  if (v.React) details.push({ label: "React", value: `v${v.React}` });
  if (v.Shell) details.push({ label: "Shell", value: `v${v.Shell}` });
  if (v.Machine) details.push({ label: "Machine", value: v.Machine });
  if (v.Webview)
    details.push({ label: "Webview", value: v.Webview, mono: true });

  if (v.Commit) {
    const isDev = v.Commit === "Development Mode";
    details.push({
      label: "Commit",
      value: isDev ? v.Commit : v.Commit.slice(0, 12),
      mono: !isDev,
      muted: isDev,
    });
  }

  return { summary, details };
};

export const HelpSettings: React.FC = () => {
  const app = useAppContext();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
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

        let machineInfo: string | undefined = undefined;
        if (import.meta.env.VITE_PLATFORM === "electron") {
          try {
            machineInfo = await commands.getMachineInfo();
          } catch (e) {
            console.error("Failed to get machine info", e);
          }
        }

        setSysInfo(() => {
          const shellName =
            import.meta.env.VITE_PLATFORM === "electron" ? "Electron" : "Tauri";
          const squigitAgent = `Squigit/${packageJson.version} OCR/${ocrVersion} STT/${sttVersion}`;
          const runtimeAgent = `Shell/${appVer} (${shellName}/${runtimeVer}) React/${React.version}`;

          const info: Record<string, string> = {
            [app.system.appName]: squigitAgent,
            Runtime: runtimeAgent,
          };

          if (import.meta.env.VITE_PLATFORM !== "electron") {
            info.Webview = navigator.userAgent;
          } else if (machineInfo) {
            info.Machine = machineInfo;
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

  const handleCopyDiagnostics = async () => {
    await copyToClipboard(JSON.stringify(sysInfo, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
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

  const { summary, details } = buildSpecs(sysInfo, app.system.appName);

  const renderRow = (spec: Spec) => (
    <div className={styles.specRow} key={spec.label}>
      <dt className={styles.specLabel}>{spec.label}</dt>
      <dd
        className={[
          styles.specValue,
          spec.mono ? styles.mono : "",
          spec.muted ? styles.muted : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {spec.value}
      </dd>
    </div>
  );

  return (
    <section className={styles.container} aria-labelledby="help-heading">
      <header className={styles.sectionHeader}>
        <h2 id="help-heading" className={styles.sectionTitle}>
          Help & Support
        </h2>
      </header>
      <div className={styles.specCard}>
        <div className={styles.specHeader}>
          <button
            type="button"
            className={styles.expandToggle}
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            aria-controls="diagnostics-list"
          >
            <span className={styles.subLabel}>System Diagnostics</span>
            <ChevronRightIcon
              size={14}
              className={`${styles.chevron} ${expanded ? styles.chevronOpen : ""}`}
            />
          </button>
          <button
            type="button"
            className={styles.copyButton}
            onClick={handleCopyDiagnostics}
            aria-label="Copy diagnostics"
            title={copied ? "Copied" : "Copy diagnostics"}
          >
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </button>
        </div>
        <dl className={styles.specList} id="diagnostics-list">
          {summary.map(renderRow)}
          {expanded && details.map(renderRow)}
        </dl>
      </div>
      <div className={styles.actionRow}>
        <button
          className={styles.actionButton}
          onClick={() => handleOpen(github.repo)}
        >
          <MarkGithubIcon size={16} className={styles.actionIcon} />
          <span className={styles.actionLabel}>Repository</span>
        </button>

        <button className={styles.actionButton} onClick={handleContactSupport}>
          <MailIcon size={16} className={styles.actionIcon} />
          <span className={styles.actionLabel}>Support</span>
        </button>

        <button className={styles.actionButton} onClick={handleReportBug}>
          <BugIcon size={16} className={styles.actionIcon} />
          <span className={styles.actionLabel}>Report Bug</span>
        </button>
      </div>
      <div className={styles.aboutSection}>
        <div className={styles.divider} />
        <div className={styles.legalRow}>
          <div className={styles.legalText}>
            Need help? Check our{" "}
            <button
              className={styles.legalLink}
              onClick={() =>
                commands.openExternalUrl(
                  "https://squigit-org.github.io/legal/terms.html",
                )
              }
            >
              Terms of Service
            </button>{" "}
            and{" "}
            <button
              className={styles.legalLink}
              onClick={() =>
                commands.openExternalUrl(
                  "https://squigit-org.github.io/legal/privacy.html",
                )
              }
            >
              Privacy Policy
            </button>
          </div>
          <div className={styles.legalText}>
            <span>© 2026 {app.system.appName}</span>
            <span className={styles.dot}>•</span>
            <span>
              <button
                className={`${styles.license}`}
                onClick={() => handleOpen(github.license)}
              >
                Apache 2.0
              </button>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
