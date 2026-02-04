/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { google } from "@/lib/config";

type AuthStage = "LOADING" | "LOGIN" | "AUTHENTICATED";

export const useAuth = () => {
  const [authStage, setAuthStage] = useState<AuthStage>("LOADING");

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const activeProfile = await invoke<any>("get_active_profile");
        if (activeProfile) {
          setAuthStage("AUTHENTICATED");
        } else {
          // Check if any profiles exist
          const hasProfiles = await invoke<boolean>("has_profiles");
          if (hasProfiles) {
            // We have profiles but none active? This shouldn't happen usually,
            // but we can default to LOGIN or try to set one active.
            // For now, let's force login screen (which lists profiles).
            setAuthStage("LOGIN");
          } else {
            setAuthStage("LOGIN");
          }
        }
      } catch (e) {
        console.error("Auth check failed:", e);
        setAuthStage("LOGIN");
      }
    };

    checkAuthStatus();
  }, []);

  const login = () => {
    setAuthStage("AUTHENTICATED");
  };

  const logout = () => {
    setAuthStage("LOGIN");
  };

  return {
    authStage,
    isAuthenticated: authStage === "AUTHENTICATED",
    login,
    logout,
  };
};
