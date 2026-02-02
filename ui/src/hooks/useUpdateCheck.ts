/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from "react";
import { fetchReleaseNotes } from "@/features/onboarding";
import packageJson from "../../package.json";

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
