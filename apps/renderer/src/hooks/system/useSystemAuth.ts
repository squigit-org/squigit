/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { commands } from "@/platform";
import { platform } from "@/platform";
import { useState, useEffect } from "react";

type AuthStage = "LOADING" | "LOGIN" | "AUTHENTICATED";
let hasLoggedMissingAuthConfig = false;
let currentAuthAttempt = 0;

type AuthFailurePayload = {
  error: string;
  cancelled: boolean;
};

export const useAuth = () => {
  const [authStage, setAuthStage] = useState<AuthStage>("LOADING");

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const activeProfile = await platform.invoke<any>("get_active_profile");
        if (activeProfile) {
          setAuthStage("AUTHENTICATED");
        } else {
          const hasProfiles = await platform.invoke<boolean>("has_profiles");
          if (hasProfiles) {
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

export const useSystemAuth = (
  setSwitchingProfileId: (id: string | null) => void,
) => {
  useEffect(() => {
    let cancelled = false;

    const attachFailureListener = async () => {
      const unlisten = await platform.listen<AuthFailurePayload>(
        "auth-failure",
        (payload) => {
          if (cancelled) return;

          setSwitchingProfileId(null);

          if (!payload?.cancelled) {
            console.error("Google auth failed:", payload?.error);
          }
        },
      );

      if (cancelled) {
        unlisten();
      }

      return unlisten;
    };

    let cleanup: (() => void) | undefined;
    attachFailureListener().then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [setSwitchingProfileId]);

  const addAccount = async () => {
    currentAuthAttempt++;
    const attemptId = currentAuthAttempt;

    setSwitchingProfileId("creating_account");

    if (attemptId > 1) {
      // Proactively cancel any existing background flow so we don't hit "Address in use"
      try {
        await commands.cancelGoogleAuth();
        // Give the backend a tiny fraction of a second to release the port
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (e) {}
    }

    const performAuth = async (): Promise<any> => {
      return await commands.startGoogleAuth();
    };

    let result: any = null;

    try {
      result = await performAuth();
    } catch (e: any) {
      const errorMsg = String(e);
      if (
        errorMsg.includes("Authentication already in progress") ||
        errorMsg.includes("Address in use") ||
        errorMsg.includes("OSError")
      ) {
        console.warn("Auth blocked, attempting to cleanup and retry...");
        try {
          await commands.cancelGoogleAuth();
          await new Promise((resolve) => setTimeout(resolve, 500));
          result = await performAuth();
        } catch (retryErr) {
          console.error("Failed to restart auth:", retryErr);
        }
      } else {
        const missingConfig = errorMsg.includes(
          "Google authentication is not configured in this build.",
        );
        if (missingConfig) {
          if (!hasLoggedMissingAuthConfig) {
            hasLoggedMissingAuthConfig = true;
            console.warn(
              "[auth] Google auth is not configured in this build. See VS Code terminal for setup steps.",
            );
          }
        } else {
          console.error("Failed to start auth:", e);
        }
      }
    }

    // Only reset the UI if this is still the active attempt!
    // This prevents the "ugly flicker" when an older attempt gets cancelled by a newer rapid click.
    if (currentAuthAttempt === attemptId) {
      setSwitchingProfileId(null);
    }
    
    return result;
  };

  const cancelAuth = async () => {
    try {
      await commands.cancelGoogleAuth();
    } catch (e) {
      console.error("Failed to cancel auth:", e);
    } finally {
      setSwitchingProfileId(null);
    }
  };

  return { addAccount, cancelAuth };
};
