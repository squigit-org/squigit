/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  AppMediaProvider,
  type AppMediaContextValue,
} from "../context/AppMedia";
import {
  AppNavigationProvider,
  type AppNavigationContextValue,
} from "../context/AppNavigation";
import { useApp } from "../hooks/useApp";

export type AppState = ReturnType<typeof useApp>;

const AppContext = createContext<AppState | null>(null);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within a AppProvider");
  }
  return context;
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const app = useApp();
  const mediaValue = useMemo<AppMediaContextValue>(
    () => ({
      mediaViewer: app.mediaViewer,
      openMediaViewer: app.openMediaViewer,
      closeMediaViewer: app.closeMediaViewer,
    }),
    [
      app.closeMediaViewer,
      app.mediaViewer,
      app.openMediaViewer,
    ],
  );
  const navigationValue = useMemo<AppNavigationContextValue>(
    () => ({
      searchOverlay: app.searchOverlay,
      openSearchOverlay: app.openSearchOverlay,
      closeSearchOverlay: app.closeSearchOverlay,
      handleNavigation: app.handleNavigation,
      handleNewSession: app.handleNewSession,
      canNavigateBack: app.canNavigateBack,
      canNavigateForward: app.canNavigateForward,
      historyNavigationDirection: app.historyNavigationDirection,
      navigateBack: app.navigateBack,
      navigateForward: app.navigateForward,
      revealSearchMatch: app.revealSearchMatch,
      clearSearchReveal: app.clearSearchReveal,
      isNavigating: app.isNavigating,
      isThreadContentReady: app.isThreadContentReady,
      showThreadShellDuringNavigation: app.showThreadShellDuringNavigation,
    }),
    [
      app.clearSearchReveal,
      app.closeSearchOverlay,
      app.handleNewSession,
      app.handleNavigation,
      app.canNavigateBack,
      app.canNavigateForward,
      app.historyNavigationDirection,
      app.isThreadContentReady,
      app.isNavigating,
      app.navigateBack,
      app.navigateForward,
      app.openSearchOverlay,
      app.revealSearchMatch,
      app.searchOverlay,
      app.showThreadShellDuringNavigation,
    ],
  );

  return (
    <AppContext.Provider value={app}>
      <AppMediaProvider value={mediaValue}>
        <AppNavigationProvider value={navigationValue}>
          {children}
        </AppNavigationProvider>
      </AppMediaProvider>
    </AppContext.Provider>
  );
};
