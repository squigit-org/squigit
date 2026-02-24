/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, ReactNode } from "react";
import { useShell } from "../hooks/useShell";

type ShellState = ReturnType<typeof useShell>;

const ShellContext = createContext<ShellState | null>(null);

export const useShellContext = () => {
  const context = useContext(ShellContext);
  if (!context) {
    throw new Error("useShellContext must be used within a ShellProvider");
  }
  return context;
};

export const ShellProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const shell = useShell();

  return (
    <ShellContext.Provider value={shell}>{children}</ShellContext.Provider>
  );
};
