/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, type ReactNode } from "react";
import type { AppState } from "../providers/AppProvider";

export type AppMediaContextValue = Pick<
  AppState,
  | "mediaViewer"
  | "rememberAttachmentSourcePath"
  | "openMediaViewer"
  | "closeMediaViewer"
  | "getAttachmentSourcePath"
>;

const AppMediaContext = createContext<AppMediaContextValue | null>(null);

export const useMediaContext = () => {
  const context = useContext(AppMediaContext);
  if (!context) {
    throw new Error("useMediaContext must be used within an AppMediaProvider");
  }
  return context;
};

export const AppMediaProvider: React.FC<{
  children: ReactNode;
  value: AppMediaContextValue;
}> = ({ children, value }) => {
  return (
    <AppMediaContext.Provider value={value}>
      {children}
    </AppMediaContext.Provider>
  );
};
