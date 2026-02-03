/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import React, { useEffect, useState, useCallback } from "react";
import { ThemeContext } from "@/hooks/useTheme";
import { loadPreferences, savePreferences } from "@/lib/config/preferences";
import { DEFAULT_THEME } from "@/lib/utils/constants";

const THEME_STORAGE_KEY = "theme";

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      // 1. Check local storage first (user preference overrides everything)
      const cached = localStorage.getItem(THEME_STORAGE_KEY);
      if (cached === "light" || cached === "dark") {
        return cached;
      }

      // 2. If no preference, check OS preference once (First Run Logic)
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        return "dark";
      }
      return "light";
    }
    // SSR / Fallback
    return DEFAULT_THEME as "light" | "dark";
  });

  const setTheme = useCallback((newTheme: "light" | "dark") => {
    setThemeState(newTheme);

    localStorage.setItem(THEME_STORAGE_KEY, newTheme);

    document.documentElement.classList.toggle("dark", newTheme === "dark");
    document.documentElement.style.colorScheme = newTheme;
    document.body.classList.toggle("light-mode", newTheme === "light");

    loadPreferences().then((prefs) => {
      if (prefs.theme !== newTheme) {
        savePreferences({ ...prefs, theme: newTheme }).catch(console.error);
      }
    });
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  // Load preferences from file on mount (sync across instances)
  useEffect(() => {
    let mounted = true;
    loadPreferences().then((prefs) => {
      if (!mounted) return;
      // If the file explicitly has a theme different from current state, sync it.
      if (prefs.theme && prefs.theme !== theme) {
        setTheme(prefs.theme as "light" | "dark");
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Ensure DOM is synced on first mount
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    document.body.classList.toggle("light-mode", theme === "light");
  }, [theme]);

  // We explicitly removed the "System" listener here as requested.
  // The system theme is only detected once as the initial default.

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
