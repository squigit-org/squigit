/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppProvider } from "@/providers/AppProvider";
import { AppRouter } from "@/router/AppRouter";

function App() {
  useEffect(() => {
    const showWindow = async () => {
      // invoke("show_window"); // If backend has it, but standard way is:
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      await win.show();
      await win.setFocus();
    };

    showWindow();

    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (target && target.href && target.href.startsWith("http")) {
        e.preventDefault();
        invoke("open_external_url", { url: target.href });
      }
    };

    document.addEventListener("click", handleAnchorClick);
    return () => document.removeEventListener("click", handleAnchorClick);
  }, []);

  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  );
}

export default App;
