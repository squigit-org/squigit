/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, type ReactNode } from "react";
import type { AppState } from "../providers/AppProvider";

export type AppNavigationContextValue = Pick<
  AppState,
  | "searchOverlay"
  | "openSearchOverlay"
  | "closeSearchOverlay"
  | "handleSelectChat"
  | "handleNewSession"
  | "revealSearchMatch"
  | "clearSearchReveal"
  | "isNavigating"
  | "isChatContentReady"
  | "showChatShellDuringNavigation"
>;

const AppNavigationContext = createContext<AppNavigationContextValue | null>(
  null,
);

export const useNavigationContext = () => {
  const context = useContext(AppNavigationContext);
  if (!context) {
    throw new Error(
      "useNavigationContext must be used within an AppNavigationProvider",
    );
  }
  return context;
};

export const AppNavigationProvider: React.FC<{
  children: ReactNode;
  value: AppNavigationContextValue;
}> = ({ children, value }) => {
  return (
    <AppNavigationContext.Provider value={value}>
      {children}
    </AppNavigationContext.Provider>
  );
};
