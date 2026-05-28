/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import { useEffect } from "react";
import { commands } from "@/platform";
import { ThemeProvider } from "./providers/ThemeProvider";
import { AppHost } from "./AppHost";

function App() {
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a");
      if (target && target.href && target.href.startsWith("http")) {
        e.preventDefault();
        commands.openExternalUrl(target.href);
      }
    };

    document.addEventListener("click", handleAnchorClick);
    return () => document.removeEventListener("click", handleAnchorClick);
  }, []);

  return (
    <ThemeProvider>
      <AppHost />
    </ThemeProvider>
  );
}

export default App;
