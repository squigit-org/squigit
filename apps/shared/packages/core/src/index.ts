/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export {
  buildCommittedAssistantMessage,
  markPendingTurnTransportDone,
  getDefaultProgressText,
  getElapsedThoughtSeconds,
  getThoughtSecondsFromToolSteps,
  isUntitledThreadTitle,
  normalizeThreadTitle,
  runWithRetries,
  waitForRetryDelay,
  STREAM_PLAYBACK_INTERVAL_MS,
  STREAM_PRIME_DELAY_MS,
  advanceStreamCursorByWords,
  countRemainingStreamWords,
  getRenderableStreamingText,
  getStreamBatchSize,
  createToolEventHandler,
} from "./brain/engine";

export {
  cancelActiveProviderRequest,
  generateProviderTitle,
  getFriendlyProviderErrorMessage,
  getProviderHighDemandExhaustedMessage,
  getProviderHighDemandMessage,
  isProviderHighDemandError,
  parseProviderError,
  isNetworkError,
  requestProviderQuickAnswer,
  retryProviderMessage,
  sendProviderMessage,
  startProviderSession,
  startProviderSessionStream,
  shouldFallbackToDefaultProviderModel,
  DEFAULT_PROVIDER_FALLBACK_MODEL_ID,
  generateBrainTitle,
  getFriendlyBrainErrorMessage,
  getBrainHighDemandExhaustedMessage,
  getBrainHighDemandMessage,
  isBrainHighDemandError,
  isBrainQuotaZeroError,
  parseBrainError,
  isBrainNetworkError,
} from "./brain/provider";

export {
  addToHistory,
  getImageBrief,
  getImageDescription,
  initializeBrainProvider,
  popLastUserHistory,
  replaceLastAssistantHistory,
  resetBrainContext,
  setImageBrief,
  setImageDescription,
  setUserFirstMsg,
  setUserInfo,
  getBrainSessionSnapshot,
  restoreBrainSession,
  brainSessionStore,
  buildContextWindow,
} from "./brain/session";

export {
  google,
  generateSearchUrl,
  generateTranslateUrl,
} from "./services/google";

export { github } from "./services/github";
export { imgbb } from "./services/imgbb";
export { openExternalUrl } from "./services/system";
