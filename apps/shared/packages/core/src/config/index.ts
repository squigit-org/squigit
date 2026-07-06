/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export type { UserPreferences, WizardState } from "./app-settings.ts";
export {
  getDefaultPreferences,
  getWizardState,
  setWizardState,
  hasPreferencesFile,
  loadPreferences,
  savePreferences,
} from "./app-settings.ts";

export type {
  ThreadMetadata,
  ThreadCitation,
  ThreadToolStep,
  ThreadMessage,
  OcrRegion,
  OcrFrame,
  ThreadData,
  ThreadSearchResult,
  StoredImage,
  ImageResult,
} from "./thread-storage.ts";

export {
  AUTO_OCR_DISABLED_MODEL_ID,
  storeImageBytes,
  storeImageFromPath,
  getImagePath,
  createThread,
  loadThread,
  listThreads,
  searchThreads,
  deleteThread,
  updateThreadMetadata,
  appendThreadMessage,
  overwriteThreadMessages,
  saveOcrData,
  getOcrData,
  getOcrFrame,
  initOcrFrame,
  cancelOcrJob,
  saveImgbbUrl,
  getImgbbUrl,
  saveRollingSummary,
  saveImageTone,
  saveImageBrief,
  groupThreadsByDate,
} from "./thread-storage.ts";

export {
  MODEL_IDS,
  MODELS,
  DEFAULT_MODEL_ID,
  isSupportedModelId,
  resolveModelId,
  DEFAULT_OCR_MODEL_ID,
  SUPPORTED_OCR_MODEL_IDS,
  isSupportedOcrModelId,
  resolveOcrModelId,
} from "./models-config.ts";

export {
  DEFAULT_THEME,
  PREFERENCES_FILE_NAME,
  DEFAULT_CAPTURE_TYPE,
  DEFAULT_PREFERENCES,
} from "./defaults.ts";
