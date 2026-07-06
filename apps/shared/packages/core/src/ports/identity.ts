/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export interface IdentitySoul {
  name: string;
}

export interface IdentityConfig {
  prompt: string;
  soul: IdentitySoul | null;
}

export interface IdentityPort {
  getIdentityConfig(): Promise<IdentityConfig>;
  setIdentityPrompt(prompt: string): Promise<void>;
  setIdentitySoul(name: string, markdown: string): Promise<void>;
  removeIdentitySoul(): Promise<void>;
}

let identityPort: IdentityPort | null = null;

export function setIdentityPort(port: IdentityPort): void {
  identityPort = port;
}

export function getIdentityPort(): IdentityPort {
  if (!identityPort) {
    throw new Error("IdentityPort is not initialized");
  }

  return identityPort;
}
