/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { commands } from "@/platform";
import {
  CircularSpinnerIcon,
  CheckmarkIcon,
  ExternalArrowIcon,
  MacIcon,
  LinuxIcon,
  WindowsIcon,
} from "@/components/icons";
import "@fontsource/geist-sans/300.css";
import "@fontsource/geist-sans/400.css";
import styles from "./SetupStep.module.css";

type SidecarStatus = "loading" | "installed" | "not_installed";

interface SidecarInfo {
  name: string;
  command: string;
  description: string;
}

const SIDECARS: SidecarInfo[] = [
  {
    name: "Squigit OCR",
    command: "squigit-ocr --version",
    description: "Extract and select text directly from images.",
  },
  {
    name: "Squigit STT",
    command: "squigit-stt --version",
    description: "Dictate prompts and messages with local Whisper.",
  },
];

const DOWNLOAD_URL = "https://squigit-org.github.io/#download";

const PLATFORMS = [
  {
    label: "HomeBrew",
    Icon: MacIcon,
    href: DOWNLOAD_URL,
    size: 23,
  },
  {
    label: "APT/DNF",
    Icon: LinuxIcon,
    href: DOWNLOAD_URL,
    size: 28,
  },
  {
    label: "Winget",
    Icon: WindowsIcon,
    href: DOWNLOAD_URL,
    size: 26,
  },
];

interface SetupStepProps {
  onChecksDone: (done: boolean) => void;
}

export const SetupStep: React.FC<SetupStepProps> = ({ onChecksDone }) => {
  const [statuses, setStatuses] = useState<
    Record<string, { status: SidecarStatus; version: string | null }>
  >(() => {
    const initial: Record<
      string,
      { status: SidecarStatus; version: string | null }
    > = {};
    for (const sc of SIDECARS) {
      initial[sc.name] = { status: "loading", version: null };
    }
    return initial;
  });

  useEffect(() => {
    onChecksDone(false);

    const checkAll = async () => {
      const results: Record<
        string,
        { status: SidecarStatus; version: string | null }
      > = {};

      for (const sc of SIDECARS) {
        try {
          const output = await commands.runSidecarVersion(sc.command);
          const match = output.match(/(\d+\.\d+\.\d+)/);
          results[sc.name] = {
            status: "installed",
            version: match ? match[1] : output.trim(),
          };
        } catch {
          results[sc.name] = { status: "not_installed", version: null };
        }
      }

      setStatuses(results);
      onChecksDone(true);
    };

    checkAll();
  }, []);

  const handleOpenLink = (url: string) => {
    commands.openExternalUrl(url);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Squigit is ready to see and hear</h1>
        <p className={styles.subtitle}>
          Unlock Squigit's full potential by installing local-first sidecars to
          help you squiggle the perfect squigit. (Optional, but absolutely worth
          it).
        </p>
      </div>

      <div className={styles.sidecarList}>
        {SIDECARS.map((sc) => {
          const info = statuses[sc.name];
          const status = info?.status ?? "loading";
          const version = info?.version;

          return (
            <div key={sc.name} className={styles.sidecarRow}>
              <div className={styles.sidecarIcon}>
                {status === "loading" && (
                  <CircularSpinnerIcon
                    size={18}
                    color="var(--c-raw-036)"
                    className={styles.spinner}
                  />
                )}
                {status === "installed" && (
                  <CheckmarkIcon size={18} color="#34c759" />
                )}
                {status === "not_installed" && (
                  <svg
                    width={18}
                    height={18}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#ff9500"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                )}
              </div>

              <div className={styles.sidecarBody}>
                <div className={styles.sidecarTitleRow}>
                  <span className={styles.sidecarName}>{sc.name}</span>
                  <span
                    className={`${styles.badge} ${
                      status === "loading"
                        ? styles.badgeLoading
                        : status === "installed"
                          ? styles.badgeInstalled
                          : styles.badgeNotInstalled
                    }`}
                  >
                    {status === "loading" && "Checking…"}
                    {status === "installed" && `v${version}`}
                    {status === "not_installed" && "Not Installed"}
                  </span>
                </div>
                <p className={styles.sidecarDesc}>{sc.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.availablePanel}>
        <span className={styles.availableLabel}>Available today on</span>
        <div className={styles.platformLinks}>
          {PLATFORMS.map((p) => {
            const Icon = p.Icon;
            return (
              <button
                key={p.label}
                type="button"
                className={styles.platformLink}
                onClick={() => handleOpenLink(p.href)}
              >
                <span className={styles.platformIconSlot}>
                  <Icon size={p.size} />
                </span>
                {p.label}
                <ExternalArrowIcon size={9} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
