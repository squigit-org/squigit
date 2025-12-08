/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export enum WizardStep {
  UPDATE_PROMPT = 'UPDATE_PROMPT',
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
}
