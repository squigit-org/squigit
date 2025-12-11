/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export enum WizardStep {
  UPDATE = 'UPDATE',
  WELCOME = 'WELCOME',
  DESTINATION = 'DESTINATION',
  READY = 'READY',
  INSTALLING = 'INSTALLING',
  FINISHED = 'FINISHED',
}

export interface InstallerState {
  step: WizardStep;
  installPath: string;
  isAgreed: boolean;
  launchOnExit: boolean;
  arch: string;
}

export interface SystemStatus {
  os: string;
  arch: string;
  is_installed: boolean;
  home_dir: string;
}

export interface ProgressEvent {
  status: string;
  percentage: number;
}
