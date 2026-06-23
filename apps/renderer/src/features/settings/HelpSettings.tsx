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
 * human-readable rows — e.g. "Squigit/0.1.0 OCR/1.2.3" -> { Squigit: v0.1.0 },
 * { OCR Engine: v1.2.3 }. Parsing the strings here (instead of in the loader)
 * keeps the report payload untouched.
 */
type Spec = { label: string; value: string; mono?: boolean; muted?: boolean };

const ENGINE_LABELS: Record<string, string> = {
  OCR: "OCR Engine",
  STT: "STT Engine",
  React: "React",
  Shell: "Shell",
};

const DISPLAY_NAMES: Record<string, string> = {
  wayland: "Wayland",
  x11: "X11",
  unknown: "Unknown",
};

// "{os}/{arch} ({display}) {pkg}" e.g. "macOS 15.2/aarch64 (Aqua) brew".
const MACHINE_RE = /^(.+)\/(\S+)\s+\(([^)]+)\)\s+(\S+)$/;

const formatToken = (name: string, version: string, appName: string): Spec => {
  if (name === appName) return { label: appName, value: `v${version}` };
  if (name === "Electron" || name === "Tauri")
    return { label: "Runtime", value: `${name} v${version}` };

  const isMissing = version === "None";
  return {
    label: ENGINE_LABELS[name] ?? name,
    value: isMissing ? "Not installed" : `v${version}`,
    muted: isMissing,
  };
};

const parseSpecs = (info: Record<string, string>, appName: string): Spec[] => {
  const specs: Spec[] = [];

  for (const [key, raw] of Object.entries(info)) {
    // App + Runtime carry space-separated "Name/Version" tokens.
    if (key === appName || key === "Runtime") {
      for (const [, name, version] of raw.matchAll(
        /([A-Za-z][\w.-]*)\/([\w.\-+]+)/g,
      )) {
        specs.push(formatToken(name, version, appName));
      }
      continue;
    }

    if (key === "Machine") {
      const match = raw.match(MACHINE_RE);
      if (match) {
        const [, os, arch, display, pkg] = match;
        specs.push({ label: "OS", value: os });
        specs.push({ label: "Architecture", value: arch });
        specs.push({
          label: "Display",
          value: DISPLAY_NAMES[display.toLowerCase()] ?? display,
        });
        specs.push({ label: "Package Manager", value: pkg });
        continue;
      }
    }

    if (key === "Commit") {
      const isDev = raw === "Development Mode";
      specs.push({
        label: "Commit",
        value: isDev ? raw : raw.slice(0, 12),
        mono: !isDev,
        muted: isDev,
      });
      continue;
    }

    // Webview user-agent or any other unstructured value.
    specs.push({ label: key, value: raw, mono: true });
  }

  return specs;
};

export const HelpSettings: React.FC = () => {
  const app = useAppContext();
  const [copied, setCopied] = useState(false);
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

  const specs = parseSpecs(sysInfo, app.system.appName);

  return (
    <section className={styles.container} aria-labelledby="help-heading">
      <header className={styles.sectionHeader}>
        <h2 id="help-heading" className={styles.sectionTitle}>
          Help & Support
        </h2>
      </header>
      <div className={styles.specCard}>
        <div className={styles.specHeader}>
          <span className={styles.subLabel}>System Diagnostics</span>
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
        <dl className={styles.specList}>
          {specs.map((spec, i) => (
            <div className={styles.specRow} key={`${spec.label}-${i}`}>
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
          ))}
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
          <span className={styles.chevron}>›</span>
        </button>

        <button className={styles.actionButton} onClick={handleContactSupport}>
          <span className={styles.iconWrapper}>
            <MailIcon size={18} className={styles.actionIcon} />
          </span>
          <span className={styles.textGroup}>
            <span className={styles.actionLabel}>Contact Support</span>
            <span className={styles.actionSubtitle}>Get in touch</span>
          </span>
          <span className={styles.chevron}>›</span>
        </button>

        <button className={styles.actionButton} onClick={handleReportBug}>
          <span className={styles.iconWrapper}>
            <BugIcon size={18} className={styles.actionIcon} />
          </span>
          <span className={styles.textGroup}>
            <span className={styles.actionLabel}>Report Bug</span>
            <span className={styles.actionSubtitle}>Help us improve</span>
          </span>
          <span className={styles.chevron}>›</span>
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
