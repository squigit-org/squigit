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
