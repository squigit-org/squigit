// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const addon = require("./addon/index.node");

export const {
  analyzeImage,
  appendThreadMessage,
  cancelRequest,
  clearActiveProfile,
  compressConversation,
  deleteThread,
  deleteProfile,
  findProfileByEmail,
  generateThreadTitle,
  generateImageBrief,
  getActiveProfileId,
  getApiKey,
  getImagePath,
  getReverseImageSearchUrl,
  getProfile,
  getRollingSummary,
  getStoreBaseDir,
  hasProfiles,
  listThreads,
  listProfiles,
  loadThread,
  profileCount,
  promptThread,
  requestQuickAnswer,
  saveApiKey,
  saveReverseImageSearchUrl,
  saveRollingSummary,
  setActiveProfile,
  startGoogleAuth,
  startStt,
  stopStt,
  storeImageFromPath,
  streamThread,
  updateThreadMetadata,
  validateAuthCredentials,
} = addon as typeof import("./addon/index.js");

export type {
  NapiAnalyzeResult,
  NapiAuthResult,
  NapiThreadData,
  NapiThreadMessage,
  NapiThreadMetadata,
  NapiProfile,
  NapiPromptResult,
  NapiSttEvent,
  NapiSttOptions,
  NapiStoredImage,
  NapiStreamEvent,
} from "./addon/index.js";
