// Copyright 2026 a7mddra
// SPDX-License-Identifier: Apache-2.0

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const addon = require("./addon/index.node");

export const {
  analyzeImage,
  appendChatMessage,
  cancelRequest,
  clearActiveProfile,
  compressConversation,
  deleteChat,
  deleteProfile,
  findProfileByEmail,
  generateChatTitle,
  generateImageBrief,
  getActiveProfileId,
  getApiKey,
  getImagePath,
  getImgbbUrl,
  getProfile,
  getRollingSummary,
  getStoreBaseDir,
  hasProfiles,
  listChats,
  listProfiles,
  loadChat,
  profileCount,
  promptChat,
  requestQuickAnswer,
  saveApiKey,
  saveImgbbUrl,
  saveRollingSummary,
  setActiveProfile,
  startGoogleAuth,
  storeImageFromPath,
  streamChat,
  updateChatMetadata,
  validateAuthCredentials,
} = addon as typeof import("./addon/index.js");

export type {
  NapiAnalyzeResult,
  NapiAuthResult,
  NapiChatData,
  NapiChatMessage,
  NapiChatMetadata,
  NapiProfile,
  NapiPromptResult,
  NapiStoredImage,
  NapiStreamEvent,
} from "./addon/index.js";
