/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import React, { useEffect, useState, useCallback } from "react";
import { ThemeContext } from "@/hooks/useTheme";
import { loadPreferences, savePreferences } from "@/lib/storage/app-settings";
import { invoke } from "@tauri-apps/api/core";

const THEME_STORAGE_KEY = "theme";

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setThemeState] = useState<"light" | "dark" | "system">(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(THEME_STORAGE_KEY);
      if (cached === "light" || cached === "dark" || cached === "system") {
        return cached;
      }
      return "system";
    }
    return "system";
  });

  const getSystemThemeFallback = useCallback((): "light" | "dark" => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  }, []);

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    if (theme === "system") return getSystemThemeFallback();
    return theme;
  });

  const applyDomTheme = useCallback((targetTheme: "light" | "dark") => {
    document.documentElement.classList.toggle("dark", targetTheme === "dark");
    document.documentElement.style.colorScheme = targetTheme;
    document.body.classList.toggle("light-mode", targetTheme === "light");
  }, []);

  const setTheme = useCallback((newTheme: "light" | "dark" | "system") => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);

    loadPreferences().then((prefs) => {
      if (prefs.theme !== newTheme) {
        savePreferences({ ...prefs, theme: newTheme }).catch(console.error);
      }
    });
  }, []);

  useEffect(() => {
    let abortController = new AbortController();

    const setupTheme = async () => {
      if (theme === "system") {
        // 1. Initial Fetch from Rust (Nuclear/Robust method)
        try {
          const sysTheme = await invoke<string>("get_system_theme");
          if (abortController.signal.aborted) return;
          const newResolved = sysTheme === "dark" ? "dark" : "light";
          setResolvedTheme(newResolved);
          applyDomTheme(newResolved);
        } catch (e) {
          console.warn(
            "Failed to get system theme from Rust, using fallback",
            e,
          );
          // Fallback is already set by initial state, but we can re-check
          const fallback = getSystemThemeFallback();
          setResolvedTheme(fallback);
          applyDomTheme(fallback);
        }
      } else {
        // Manual override
        setResolvedTheme(theme);
        applyDomTheme(theme);
      }
    };

    setupTheme();

    return () => {
      abortController.abort();
    };
  }, [theme, applyDomTheme, getSystemThemeFallback]);

  // Load preferences from file on mount
  useEffect(() => {
    let mounted = true;
    loadPreferences().then((prefs) => {
      if (!mounted) return;
      if (prefs.theme && prefs.theme !== theme) {
        setTheme(prefs.theme as "light" | "dark" | "system");
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
