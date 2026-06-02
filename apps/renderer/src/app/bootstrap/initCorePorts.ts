/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

import { platform } from "@/platform";
import type { ProviderStreamEvent } from "@squigit/core/brain/engine";
import {
  setPreferencesPort,
  setProviderPort,
  setStoragePort,
  setSystemPort,
  type StreamGeminiChatInput,
} from "@squigit/core/ports";

let initialized = false;

export function initializeCorePorts(): void {
  if (initialized) return;

  setProviderPort({
    streamChat: (input: StreamGeminiChatInput) => platform.invoke("stream_chat", input),
    generateImageBrief: (apiKey: string, imagePath: string, model?: string) =>
      platform.invoke<string>("generate_image_brief", { apiKey, imagePath, model }),
    generateChatTitle: (apiKey: string, model: string, promptContext: string) =>
      platform.invoke<string>("generate_chat_title", { apiKey, model, promptContext }),
    compressConversation: (
      apiKey: string,
      imageBrief: string,
      historyToCompress: string,
    ) =>
      platform.invoke<string>("compress_conversation", {
        apiKey,
        imageBrief,
        historyToCompress,
      }),
    persistRollingSummary: (chatId: string, summary: string) =>
      platform.invoke("save_rolling_summary", { chatId, summary }),
    cancelRequest: (channelId: string | null) =>
      platform.invoke("cancel_request", { channelId }),
    requestQuickAnswer: (channelId: string) =>
      platform.invoke("quick_answer_request", { channelId }),
    listenToStream: async (
      channelId: string,
      onEvent: (event: ProviderStreamEvent) => void,
    ) => {
      const unlisten = await platform.listen<ProviderStreamEvent>(channelId, (payload) => {
        onEvent(payload);
      });
      return () => {
        unlisten();
      };
    },
  });

  setStoragePort({
    storeImageBytes: (bytes: number[]) => platform.invoke("store_image_bytes", { bytes }),
    storeImageFromPath: (path: string) => platform.invoke("store_image_from_path", { path }),
    getImagePath: (hash: string) => platform.invoke("get_image_path", { hash }),
    createChat: (title: string, imageHash: string, ocrLang?: string | null) =>
      platform.invoke("create_chat", { title, imageHash, ocrLang }),
    loadChat: (chatId: string) => platform.invoke("load_chat", { chatId }),
    listChats: () => platform.invoke("list_chats"),
    searchChats: (query: string, limit: number) =>
      platform.invoke("search_chats", { query, limit }),
    deleteChat: (chatId: string) => platform.invoke("delete_chat", { chatId }),
    updateChatMetadata: (metadata) => platform.invoke("update_chat_metadata", { metadata }),
    appendChatMessage: (
      chatId: string,
      role: "user" | "assistant",
      content: string,
    ) => platform.invoke("append_chat_message", { chatId, role, content }),
    overwriteChatMessages: (chatId, messages) =>
      platform.invoke("overwrite_chat_messages", { chatId, messages }),
    saveOcrData: (chatId, modelId, ocrData) =>
      platform.invoke("save_ocr_data", { chatId, modelId, ocrData }),
    getOcrData: (chatId, modelId) => platform.invoke("get_ocr_data", { chatId, modelId }),
    getOcrFrame: (chatId) => platform.invoke("get_ocr_frame", { chatId }),
    initOcrFrame: (chatId, modelIds) =>
      platform.invoke("init_ocr_frame", { chatId, modelIds }),
    cancelOcrJob: () => platform.invoke("cancel_ocr_job"),
    saveImgbbUrl: (chatId, url) => platform.invoke("save_imgbb_url", { chatId, url }),
    getImgbbUrl: (chatId) => platform.invoke("get_imgbb_url", { chatId }),
    saveRollingSummary: (chatId, summary) =>
      platform.invoke("save_rolling_summary", { chatId, summary }),
    saveImageTone: (chatId, tone) => platform.invoke("save_image_tone", { chatId, tone }),
    saveImageBrief: (chatId, brief) => platform.invoke("save_image_brief", { chatId, brief }),
  });

  setPreferencesPort({
    hasAgreedFlag: () => platform.invoke<boolean>("has_agreed_flag"),
    setAgreedFlag: () => platform.invoke("set_agreed_flag"),
    getWizardState: () => platform.invoke<{ step: number; isFinished: boolean }>("get_wizard_state"),
    setWizardState: (state) => platform.invoke("set_wizard_state", state),
    hasPreferencesFile: (fileName: string) =>
      platform.fs.exists(fileName, { baseDir: "AppConfig" }),
    readPreferencesFile: (fileName: string) =>
      platform.fs.readTextFile(fileName, { baseDir: "AppConfig" }),
    writePreferencesFile: async (fileName: string, content: string) => {
      await platform.fs.mkdir("", { baseDir: "AppConfig", recursive: true });
      await platform.fs.writeTextFile(fileName, content, { baseDir: "AppConfig" });
    },
  });

  setSystemPort({
    openExternalUrl: (url: string) => platform.invoke("open_external_url", { url }),
    deleteTempFile: (path: string) => platform.invoke("delete_temp_file", { path }),
    getApiKey: (provider, profileId) =>
      platform.invoke<string>("get_api_key", { provider, profileId }),
    uploadImageToImgBB: (imagePath: string, apiKey: string) =>
      platform.invoke<string>("upload_image_to_imgbb", { imagePath, apiKey }),
    closeImgbbWindow: () => platform.invoke("close_imgbb_window"),
    listenToSystemEvent: async <TPayload>(
      eventName: string,
      onEvent: (payload: TPayload) => void,
    ) => {
      const unlisten = await platform.listen<TPayload>(eventName, (payload) => {
        onEvent(payload);
      });
      return () => {
        unlisten();
      };
    },
  });

  initialized = true;
}
