/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export type { BrainParsedError } from "./gemini/errors";

export {
  cancelCurrentRequest as cancelActiveProviderRequest,
  generateProviderTitle,
  getFriendlyProviderErrorMessage,
  getProviderHighDemandExhaustedMessage,
  getProviderHighDemandMessage,
  isProviderHighDemandError,
  isProviderQuotaZeroError,
  isProviderRateLimitError,
  parseProviderError,
  isNetworkError,
  quickAnswerCurrentRequest as requestProviderQuickAnswer,
  retryFromMessage as retryProviderMessage,
  sendMessage as sendProviderMessage,
  startNewThread as startProviderSession,
  startNewThreadStream as startProviderSessionStream,
} from "./gemini";

export {
  generateProviderTitle as generateBrainTitle,
  getFriendlyProviderErrorMessage as getFriendlyBrainErrorMessage,
  getProviderHighDemandExhaustedMessage as getBrainHighDemandExhaustedMessage,
  getProviderHighDemandMessage as getBrainHighDemandMessage,
  isProviderHighDemandError as isBrainHighDemandError,
  isProviderQuotaZeroError as isBrainQuotaZeroError,
  isProviderRateLimitError as isBrainRateLimitError,
  parseProviderError as parseBrainError,
  isNetworkError as isBrainNetworkError,
} from "./gemini";
