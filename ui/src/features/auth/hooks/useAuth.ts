/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { google } from "@/lib/config";

type AuthStage = "LOADING" | "GEMINI_SETUP" | "LOGIN" | "AUTHENTICATED";

export const useAuth = () => {
  const [authStage, setAuthStage] = useState<AuthStage>("LOADING");
  const [isWatcherActive, setIsWatcherActive] = useState(false);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const hasKey = await invoke<boolean>("check_file_exists", {
          filename: "gemini_key.json",
        });

        if (hasKey) {
          const hasProfile = await invoke<boolean>("check_file_exists", {
            filename: "profile.json",
          });
          setAuthStage(hasProfile ? "AUTHENTICATED" : "LOGIN");
        } else {
          setAuthStage("GEMINI_SETUP");
        }
      } catch (e) {
        console.error("Auth check failed:", e);
        setAuthStage("GEMINI_SETUP");
      }
    };

    checkAuthStatus();
  }, []);

  useEffect(() => {
    const unlisten = listen<{ provider: string; key: string }>(
      "clipboard-text",
      async (event) => {
        const { provider, key } = event.payload;

        if (provider === "imgbb") {
          invoke("close_imgbb_window");
        }

        await invoke("stop_clipboard_watcher");
        setIsWatcherActive(false);
        await invoke("encrypt_and_save", { plaintext: key, provider });

        if (provider === "gemini") {
          const hasProfile = await invoke("check_file_exists", {
            filename: "profile.json",
          });
          setAuthStage(hasProfile ? "AUTHENTICATED" : "LOGIN");
          window.location.reload();
        }
      },
    );

    return () => {
      unlisten.then((f) => f());
      invoke("stop_clipboard_watcher");
    };
  }, []);

  const startWatcher = async () => {
    if (isWatcherActive) return;
    setIsWatcherActive(true);
    await invoke("start_clipboard_watcher");
  };

  const completeGeminiSetup = () => {
    const deepLink = google.aiStudio.key;
    invoke("open_external_url", { url: deepLink });
    startWatcher();
  };

  const login = () => {
    setAuthStage("AUTHENTICATED");
  };

  const logout = () => {
    setAuthStage("LOGIN");
  };

  return {
    authStage,
    isAuthenticated: authStage === "AUTHENTICATED",
    completeGeminiSetup,
    isWatcherActive,
    login,
    logout,
  };
};
