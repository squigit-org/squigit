/**
 * @license
 * copyright 2026 a7mddra
 * spdx-license-identifier: apache-2.0
 */

import React, { createContext, useContext, ReactNode } from "react";
import { ThemeProvider } from "./ThemeProvider";

interface AppContextType {
  ready: boolean;
}

const AppContext = createContext<AppContextType>({ ready: true });

export const useApp = () => useContext(AppContext);

export const AppProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  return (
    <AppContext.Provider value={{ ready: true }}>
      <ThemeProvider>{children}</ThemeProvider>
    </AppContext.Provider>
  );
};
