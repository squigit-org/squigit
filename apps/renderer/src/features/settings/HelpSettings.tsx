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
type Spec = {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  loading?: boolean;
  shimmerWidth?: string;
};

// "{os}/{arch} ({display}) {pkg}" e.g. "macOS 15.2/aarch64 (Aqua) brew".
const MACHINE_RE = /^(.+)\/(\S+)\s+\([^)]+\)\s+\S+$/;
const VERSION_TOKEN = /([A-Za-z][\w.-]*)\/([\w.\-+]+)/g;

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
      v[key] = raw;
    }
  }
  return v;
};

/**
 * Build the full static list of diagnostic rows. Every row always exists —
 * rows whose value is not yet available get `loading: true` so the caller
 * can render a shimmer placeholder instead of hiding the row.
 */
const buildSpecs = (
  info: Record<string, string>,
  appName: string,
  isElectron: boolean,
): Spec[] => {
  const v = collectValues(info, appName);
  const isLoading = (val: string | undefined) =>
    !val || val.includes("Loading");
  const ver = (x: string) => (x === "None" ? "—" : `v${x}`);

  const specs: Spec[] = [];

  // App version — 1x
  specs.push({
    label: appName,
    value: v[appName] ? `v${v[appName]}` : "—",
    loading: isLoading(v[appName]),
    shimmerWidth: "80px",
  });

  // System / OS — 3x
  const osVal = v.OS ? (v.Arch ? `${v.OS} (${v.Arch})` : v.OS) : "—";
  specs.push({
    label: "System",
    value: osVal,
    loading: isLoading(v.OS),
    shimmerWidth: "240px",
  });

  // Runtime — 1.5x
  const runtimeVal = v.Electron
    ? `Electron v${v.Electron}`
    : v.Tauri
      ? `Tauri v${v.Tauri}`
      : "—";
  specs.push({
    label: "Runtime",
    value: runtimeVal,
    loading: isLoading(v.Electron ?? v.Tauri),
    shimmerWidth: "120px",
  });

  // Engines (OCR + STT) — 2x
  const enginesLoading = isLoading(v.OCR) && isLoading(v.STT);
  const installed =
    !enginesLoading &&
    Boolean((v.OCR && v.OCR !== "None") || (v.STT && v.STT !== "None"));
  const engineParts: string[] = [];
  if (v.OCR !== undefined) engineParts.push(`OCR ${ver(v.OCR)}`);
  if (v.STT !== undefined) engineParts.push(`STT ${ver(v.STT)}`);
  specs.push({
    label: "Engines",
    value: enginesLoading
      ? "—"
      : installed
        ? engineParts.join(" · ")
        : "Not installed",
    loading: enginesLoading,
    muted: !enginesLoading && !installed,
    shimmerWidth: "160px",
  });

  // React — 1.5x
  specs.push({
    label: "React",
    value: v.React ? `v${v.React}` : "—",
    loading: isLoading(v.React),
    shimmerWidth: "120px",
  });

  // Shell — 1x
  specs.push({
    label: "Shell",
    value: v.Shell ? `v${v.Shell}` : "—",
    loading: isLoading(v.Shell),
    shimmerWidth: "80px",
  });

  // Webview (tauri only)
  if (!isElectron) {
    specs.push({
      label: "Webview",
      value: v.Webview ?? "—",
      mono: !isLoading(v.Webview),
      loading: isLoading(v.Webview),
    });
  }

  // Commit
  const isDev = v.Commit === "Development Mode";
  specs.push({
    label: "Commit",
    value: isDev ? v.Commit : v.Commit ? v.Commit.slice(0, 12) : "—",
    mono: !isDev && !isLoading(v.Commit),
    muted: isDev,
    loading: isLoading(v.Commit) && v.Commit !== "Development Mode",
    shimmerWidth: "160px",
  });

  return specs;
};

export const HelpSettings: React.FC = () => {
  const app = useAppContext();
  const isElectron = import.meta.env.VITE_PLATFORM === "electron";
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sysInfo, setSysInfo] = useState<Record<string, string>>({
    [app.system.appName]: `Squigit/${packageJson.version} Loading`,
    Runtime: "Loading",
    ...(!isElectron ? { Webview: "Loading" } : {}),
    Commit: import.meta.env.COMMIT_SHA || "Development Mode",
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
        if (isElectron) {
          try {
            machineInfo = await commands.getMachineInfo();
          } catch (e) {
            console.error("Failed to get machine info", e);
          }
        }

        setSysInfo(() => {
          const shellName = isElectron ? "Electron" : "Tauri";
          const squigitAgent = `Squigit/${packageJson.version} OCR/${ocrVersion} STT/${sttVersion}`;
          const runtimeAgent = `Shell/${appVer} (${shellName}/${runtimeVer}) React/${React.version}`;

          const info: Record<string, string> = {
            [app.system.appName]: squigitAgent,
            Runtime: runtimeAgent,
          };

          if (!isElectron) {
            info.Webview = navigator.userAgent;
          } else if (machineInfo) {
            info.Machine = machineInfo;
          }

          info.Commit = import.meta.env.COMMIT_SHA || "Development Mode";

          return info;
        });
        setLoaded(true);
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

  const specs = buildSpecs(sysInfo, app.system.appName, isElectron);

  const renderRow = (spec: Spec) => (
    <div className={styles.specRow} key={spec.label}>
      <dt className={styles.specLabel}>{spec.label}</dt>
      <dd
        className={[
          styles.specValue,
          spec.mono && loaded ? styles.mono : "",
          spec.muted && loaded ? styles.muted : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {!loaded ? (
          <span
            className={styles.shimmer}
            style={spec.shimmerWidth ? { width: spec.shimmerWidth } : undefined}
            aria-hidden="true"
          />
        ) : (
          spec.value
        )}
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
          <div className={styles.expandToggle}>
            <span className={styles.subLabel}>System Diagnostics</span>
          </div>
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
          {specs.map(renderRow)}
        </dl>
      </div>
      <div className={styles.actionRow}>
        <button
          className={styles.actionButton}
          onClick={() => handleOpen(github.repo)}
        >
          <span className={styles.iconWrapper}>
            <MarkGithubIcon size={18} className={styles.actionIcon} />
          </span>
          <span className={styles.textGroup}>
            <span className={styles.actionLabel}>View Repository</span>
            <span className={styles.actionSubtitle}>Explore on GitHub</span>
          </span>
          <span className={styles.actionChevron}>›</span>
        </button>

        <button className={styles.actionButton} onClick={handleContactSupport}>
          <span className={styles.iconWrapper}>
            <MailIcon size={18} className={styles.actionIcon} />
          </span>
          <span className={styles.textGroup}>
            <span className={styles.actionLabel}>Contact Support</span>
            <span className={styles.actionSubtitle}>Get in touch</span>
          </span>
          <span className={styles.actionChevron}>›</span>
        </button>

        <button className={styles.actionButton} onClick={handleReportBug}>
          <span className={styles.iconWrapper}>
            <BugIcon size={18} className={styles.actionIcon} />
          </span>
          <span className={styles.textGroup}>
            <span className={styles.actionLabel}>Report Bug</span>
            <span className={styles.actionSubtitle}>Help us improve</span>
          </span>
          <span className={styles.actionChevron}>›</span>
        </button>
      </div>
      <div className={styles.footer}>
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
