/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WizardState } from "../config/app-settings";

export interface ConfigPort {
  getWizardState(): Promise<WizardState>;
  setWizardState(state: WizardState): Promise<void>;
  hasConfigFile(fileName: string): Promise<boolean>;
  readConfigFile(fileName: string): Promise<string>;
  writeConfigFile(fileName: string, content: string): Promise<void>;
}

let configPort: ConfigPort | null = null;

export function setConfigPort(port: ConfigPort): void {
  configPort = port;
}

export function getConfigPort(): ConfigPort {
  if (!configPort) {
    throw new Error("ConfigPort is not initialized");
  }

  return configPort;
}
