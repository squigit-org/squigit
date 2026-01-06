/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import React, { useEffect, useState, useCallback } from "react";
import { ThemeContext } from "../hooks/useTheme";
import { loadPreferences, savePreferences } from "../lib/config/preferences";
import { DEFAULT_THEME } from "../lib/utils/constants";

const THEME_STORAGE_KEY = "theme";

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setThemeState] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const cached = localStorage.getItem(THEME_STORAGE_KEY);
      if (cached === "light" || cached === "dark") {
        return cached;
      }
    }
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

  useEffect(() => {
    let mounted = true;
    loadPreferences().then((prefs) => {
      if (!mounted) return;

      if (prefs.theme && prefs.theme !== theme) {
        setTheme(prefs.theme);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    document.body.classList.toggle("light-mode", theme === "light");
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
