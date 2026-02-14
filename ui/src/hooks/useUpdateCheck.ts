/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import packageJson from "../../package.json";
import { github } from "@/lib/config";

const RELEASE_NOTES_URL = github.rawChangelog;

export interface ReleaseInfo {
  version: string;
  notes: string;
  hasUpdate: boolean;
}

const STORAGE_KEYS = {
  VERSION: "pending_update_version",
  NOTES: "pending_update_notes",
  AVAILABLE: "pending_update_available",
};

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export const fetchReleaseNotes = async (): Promise<ReleaseInfo> => {
  try {
    const response = await fetch(RELEASE_NOTES_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch release notes: ${response.statusText}`);
    }
    const text = await response.text();

    // REGEX EXPLANATION:
    // ^##       -> Starts with "##" at the beginning of a line
    // \s+       -> One or more spaces
    // \[?       -> Optional opening bracket '['
    // (\d...)   -> Capture Group 1: The SemVer version (X.Y.Z)
    // \]?       -> Optional closing bracket ']'
    // .*$       -> Match the rest of the line (e.g. comments/dates) so we can skip it
    // flags: gm -> Global (find all), Multiline (^ matches start of lines)
    const headerRegex = /^##\s+\[?(\d+\.\d+\.\d+)\]?.*$/gm;

    const matches = Array.from(text.matchAll(headerRegex));

    if (matches.length === 0) {
      return { version: packageJson.version, notes: "", hasUpdate: false };
    }

    const latestMatch = matches[0];
    const latestVersion = latestMatch[1];

    if (compareVersions(latestVersion, packageJson.version) <= 0) {
      return { version: latestVersion, notes: "", hasUpdate: false };
    }

    const startIdx = latestMatch.index! + latestMatch[0].length;

    const endIdx = matches.length > 1 ? matches[1].index! : text.length;

    const rawBody = text.slice(startIdx, endIdx);

    const notes = rawBody
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("-") || line.startsWith("*"))
      .join("\n");

    return {
      version: latestVersion,
      notes: notes.trim(),
      hasUpdate: true,
    };
  } catch (error) {
    console.error("Error fetching release notes:", error);
    return { version: packageJson.version, notes: "", hasUpdate: false };
  }
};

export function useUpdateCheck() {
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const { hasUpdate, version, notes } = await fetchReleaseNotes();

        if (hasUpdate) {
          localStorage.setItem(STORAGE_KEYS.AVAILABLE, "true");
          localStorage.setItem(STORAGE_KEYS.VERSION, version);
          localStorage.setItem(STORAGE_KEYS.NOTES, notes);
        } else {
          clearPendingUpdate();
        }
      } catch (error) {
        console.error("Failed to check for updates", error);
      }
    };

    checkUpdate();
  }, []);
}

export function getPendingUpdate() {
  const available = localStorage.getItem(STORAGE_KEYS.AVAILABLE) === "true";
  if (!available) return null;

  const storedVersion = localStorage.getItem(STORAGE_KEYS.VERSION) || "";
  const currentVersion = packageJson.version;

  if (compareVersions(storedVersion, currentVersion) <= 0) {
    console.log(
      `Clearing stale update: stored ${storedVersion} <= current ${currentVersion}`,
    );
    clearPendingUpdate();
    return null;
  }

  return {
    version: storedVersion,
    notes: localStorage.getItem(STORAGE_KEYS.NOTES) || "",
  };
}

export function clearPendingUpdate() {
  localStorage.removeItem(STORAGE_KEYS.AVAILABLE);
  localStorage.removeItem(STORAGE_KEYS.VERSION);
  localStorage.removeItem(STORAGE_KEYS.NOTES);
}
