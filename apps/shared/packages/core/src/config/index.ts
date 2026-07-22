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
  hasConfigFile,
  loadPreferences,
  savePreferences,
} from "./app-settings.ts";

export type {
  ThreadMetadata,
  WorkspaceMetadata,
  ThreadCitation,
  ThreadToolStep,
  ThreadMessage,
  OcrRegion,
  OcrModelAnnotation,
  OcrAnnotationEntry,
  OcrAnnotations,
  ContextWindow,
  ReverseImageSearchCache,
  ThreadData,
  ThreadSearchResult,
  StoredImage,
  ImageResult,
} from "./thread-storage.ts";

export {
  EMPTY_STATE_ASSET_ID,
  storeImageBytes,
  storeImageFromPath,
  getImagePath,
  createThread,
  createWorkspace,
  listWorkspaces,
  setThreadWorkspace,
  loadThread,
  forkThread,
  listThreads,
  searchThreads,
  deleteThread,
  updateThreadMetadata,
  appendThreadMessage,
  overwriteThreadMessages,
  saveOcrData,
  getOcrData,
  getOcrAnnotations,
  initOcrAnnotations,
  cancelOcrJob,
  saveReverseImageSearchCache,
  getReverseImageSearchCache,
  saveImageTone,
} from "./thread-storage.ts";

export {
  MODEL_IDS,
  MODELS,
  DEFAULT_MODEL_ID,
  DEFAULT_MODEL_EFFORT,
  DEFAULT_MODEL_SELECTION,
  FLASH_LITE_LATEST_MODEL_ID,
  MODEL_EFFORTS,
  buildModelAttemptPlan,
  isSupportedModelId,
  resolveModelId,
  isModelEffort,
  resolveModelEffort,
  DEFAULT_OCR_MODEL_ID,
  SUPPORTED_OCR_MODEL_IDS,
  isSupportedOcrModelId,
  resolveOcrModelId,
} from "./models-config.ts";
export type {
  GoogleModelDescriptor,
  ModelDiscoveryQueues,
} from "./models-cache.ts";
export {
  commitModelDiscovery,
  getModelDiscoverySnapshot,
  parseDiscoveredModels,
  setActiveModelDiscoveryKey,
} from "./models-cache.ts";
export type {
  ModelId,
  ModelEffort,
  ModelSelection,
  ModelTask,
  ModelAttemptPlan,
} from "./models-config.ts";

export {
  DEFAULT_THEME,
  CONFIG_FILE_NAME,
  DEFAULT_CAPTURE_TYPE,
  DEFAULT_PREFERENCES,
} from "./defaults.ts";
