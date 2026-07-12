// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

export function cliNativeUnavailable(command: string): never {
  throw new Error(
    `[cli] ${command} is not wired in this phase. Electron owns the native command contract for now.`,
  );
}
