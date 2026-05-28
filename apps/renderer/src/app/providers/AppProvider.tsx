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
import { AppMediaProvider, type AppMediaContextValue } from "../context/AppMedia";
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
      rememberAttachmentSourcePath: app.rememberAttachmentSourcePath,
      openMediaViewer: app.openMediaViewer,
      closeMediaViewer: app.closeMediaViewer,
      getAttachmentSourcePath: app.getAttachmentSourcePath,
    }),
    [
      app.closeMediaViewer,
      app.getAttachmentSourcePath,
      app.mediaViewer,
      app.openMediaViewer,
      app.rememberAttachmentSourcePath,
    ],
  );
  const navigationValue = useMemo<AppNavigationContextValue>(
    () => ({
      searchOverlay: app.searchOverlay,
      openSearchOverlay: app.openSearchOverlay,
      closeSearchOverlay: app.closeSearchOverlay,
      handleSelectChat: app.handleSelectChat,
      handleNewSession: app.handleNewSession,
      revealSearchMatch: app.revealSearchMatch,
      clearSearchReveal: app.clearSearchReveal,
      isNavigating: app.isNavigating,
      isChatContentReady: app.isChatContentReady,
      showChatShellDuringNavigation: app.showChatShellDuringNavigation,
    }),
    [
      app.clearSearchReveal,
      app.closeSearchOverlay,
      app.handleNewSession,
      app.handleSelectChat,
      app.isChatContentReady,
      app.isNavigating,
      app.openSearchOverlay,
      app.revealSearchMatch,
      app.searchOverlay,
      app.showChatShellDuringNavigation,
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
