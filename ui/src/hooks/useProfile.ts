/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

interface UseProfileResult {
  /** Currently active profile, null if not logged in */
  activeProfile: Profile | null;
  /** ID of the active profile */
  activeProfileId: string | null;
  /** All available profiles */
  profiles: Profile[];
  /** Whether any profiles exist */
  hasProfiles: boolean;
  /** Loading state */
  isLoading: boolean;
  /** Switch to a different profile */
  switchProfile: (profileId: string) => Promise<void>;
  /** Add a new account (triggers OAuth) */
  addAccount: () => Promise<void>;
  /** Delete a profile */
  deleteProfile: (profileId: string) => Promise<void>;
  /** Refresh profile list */
  refreshProfiles: () => Promise<void>;
}

/**
 * Hook to manage user profiles.
 * Tracks the active profile and provides methods for profile management.
 */
export const useProfile = (): UseProfileResult => {
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfiles = useCallback(async () => {
    try {
      const [active, all] = await Promise.all([
        invoke<Profile | null>("get_active_profile"),
        invoke<Profile[]>("list_profiles"),
      ]);
      setActiveProfile(active);
      setProfiles(all);
    } catch (e) {
      console.error("Failed to load profiles:", e);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await refreshProfiles();
      setIsLoading(false);
    };
    init();
  }, [refreshProfiles]);

  // Listen for auth-success events to refresh profiles
  useEffect(() => {
    const unlisten = listen<any>("auth-success", async () => {
      await refreshProfiles();
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [refreshProfiles]);

  const switchProfile = useCallback(
    async (profileId: string) => {
      try {
        await invoke("set_active_profile", { profileId });
        await refreshProfiles();
        // Reload to apply the new profile context
        window.location.reload();
      } catch (e) {
        console.error("Failed to switch profile:", e);
        throw e;
      }
    },
    [refreshProfiles],
  );

  const addAccount = useCallback(async () => {
    try {
      await invoke("start_google_auth");
      // Profile will be added via auth-success event
    } catch (e) {
      console.error("Failed to start auth:", e);
      throw e;
    }
  }, []);

  const deleteProfile = useCallback(
    async (profileId: string) => {
      try {
        await invoke("delete_profile", { profileId });
        await refreshProfiles();
      } catch (e) {
        console.error("Failed to delete profile:", e);
        throw e;
      }
    },
    [refreshProfiles],
  );

  return {
    activeProfile,
    activeProfileId: activeProfile?.id ?? null,
    profiles,
    hasProfiles: profiles.length > 0,
    isLoading,
    switchProfile,
    addAccount,
    deleteProfile,
    refreshProfiles,
  };
};
