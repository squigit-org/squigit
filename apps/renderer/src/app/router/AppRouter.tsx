/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from "react";
import { usePlatform } from "@/hooks/shared";
import { useAppContext } from "../providers/AppProvider";
import { AppLayout } from "../layout/AppLayout";
import { AppRoutes } from "./AppRoutes";
import { AppDialogs } from "../context/AppDialogs";

import "katex/dist/katex.min.css";

const isOnboardingId = (id: string) => id.startsWith("__system_");

export const AppRouter: React.FC = () => {
  const app = useAppContext();
  const { isMac } = usePlatform();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;

      const modPressed = isMac ? e.metaKey : e.ctrlKey;
      if (!modPressed) return;

      const key = e.key.toLowerCase();
      const isWizard = app.threadHistory.activeSessionId === "__system_wizard";

      if (!isWizard) {
        if (!e.shiftKey && !e.altKey && key === "k") {
          e.preventDefault();
          app.openSearchOverlay();
          return;
        }

        if (e.shiftKey && !e.altKey && key === "o") {
          e.preventDefault();
          app.handleNewSession();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [app, isMac]);

  const activeId = app.threadHistory.activeSessionId;
  const hasActiveThreadSession = !!activeId && !isOnboardingId(activeId);
  const isWizardRoute = activeId === "__system_wizard";
  const shouldRenderThreadShell =
    app.showThreadShellDuringNavigation ||
    hasActiveThreadSession ||
    !app.isImageMissing;

  return (
    <AppLayout
      onContextMenu={app.handleContextMenu}
      containerRef={shouldRenderThreadShell ? app.containerRef : undefined}
      isSidePanelOpen={app.isSidePanelOpen}
      enablePanelAnimation={app.enablePanelAnimation}
      isWizardRoute={isWizardRoute}
      content={<AppRoutes shouldRenderThreadShell={shouldRenderThreadShell} />}
      dialogs={<AppDialogs />}
    />
  );
};
