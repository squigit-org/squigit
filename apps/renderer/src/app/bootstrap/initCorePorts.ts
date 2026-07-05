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
  type StreamGeminiThreadInput,
} from "@squigit/core/ports";

let initialized = false;

export function initializeCorePorts(): void {
  if (initialized) return;

  setProviderPort({
    streamThread: (input: StreamGeminiThreadInput) =>
      platform.invoke("stream_thread", input),
    generateImageBrief: (apiKey: string, imagePath: string, model?: string) =>
      platform.invoke<string>("generate_image_brief", {
        apiKey,
        imagePath,
        model,
      }),
    generateThreadTitle: (
      apiKey: string,
      model: string,
      promptContext: string,
    ) =>
      platform.invoke<string>("generate_thread_title", {
        apiKey,
        model,
        promptContext,
      }),
    compressConversation: (
      apiKey: string,
      imageBrief: string,
      historyToCompress: string,
      model: string,
    ) =>
      platform.invoke<string>("compress_conversation", {
        apiKey,
        imageBrief,
        historyToCompress,
        model,
      }),
    persistRollingSummary: (threadId: string, summary: string) =>
      platform.invoke("save_rolling_summary", { threadId, summary }),
    cancelRequest: (channelId: string | null) =>
      platform.invoke("cancel_request", { channelId }),
    requestQuickAnswer: (channelId: string) =>
      platform.invoke("quick_answer_request", { channelId }),
    listenToStream: async (
      channelId: string,
      onEvent: (event: ProviderStreamEvent) => void,
    ) => {
      const unlisten = await platform.listen<ProviderStreamEvent>(
        channelId,
        (payload) => {
          onEvent(payload);
        },
      );
      return () => {
        unlisten();
      };
    },
  });

  setStoragePort({
    storeImageBytes: (bytes: number[]) =>
      platform.invoke("store_image_bytes", { bytes }),
    storeImageFromPath: (path: string) =>
      platform.invoke("store_image_from_path", { path }),
    getImagePath: (hash: string) => platform.invoke("get_image_path", { hash }),
    createThread: (title: string, imageHash: string, ocrLang?: string | null) =>
      platform.invoke("create_thread", { title, imageHash, ocrLang }),
    loadThread: (threadId: string) =>
      platform.invoke("load_thread", { threadId }),
    listThreads: () => platform.invoke("list_threads"),
    searchThreads: (query: string, limit: number) =>
      platform.invoke("search_threads", { query, limit }),
    deleteThread: (threadId: string) =>
      platform.invoke("delete_thread", { threadId }),
    updateThreadMetadata: (metadata) =>
      platform.invoke("update_thread_metadata", { metadata }),
    appendThreadMessage: (
      threadId: string,
      role: "user" | "assistant",
      content: string,
    ) => platform.invoke("append_thread_message", { threadId, role, content }),
    overwriteThreadMessages: (threadId, messages) =>
      platform.invoke("overwrite_thread_messages", { threadId, messages }),
    saveOcrData: (threadId, modelId, ocrData) =>
      platform.invoke("save_ocr_data", { threadId, modelId, ocrData }),
    getOcrData: (threadId, modelId) =>
      platform.invoke("get_ocr_data", { threadId, modelId }),
    getOcrFrame: (threadId) => platform.invoke("get_ocr_frame", { threadId }),
    initOcrFrame: (threadId, modelIds) =>
      platform.invoke("init_ocr_frame", { threadId, modelIds }),
    cancelOcrJob: () => platform.invoke("cancel_ocr_job"),
    saveImgbbUrl: (threadId, url) =>
      platform.invoke("save_imgbb_url", { threadId, url }),
    getImgbbUrl: (threadId) => platform.invoke("get_imgbb_url", { threadId }),
    saveRollingSummary: (threadId, summary) =>
      platform.invoke("save_rolling_summary", { threadId, summary }),
    saveImageTone: (threadId, tone) =>
      platform.invoke("save_image_tone", { threadId, tone }),
    saveImageBrief: (threadId, brief) =>
      platform.invoke("save_image_brief", { threadId, brief }),
  });

  setPreferencesPort({
    hasAgreedFlag: () => platform.invoke<boolean>("has_agreed_flag"),
    setAgreedFlag: () => platform.invoke("set_agreed_flag"),
    getWizardState: () =>
      platform.invoke<{ step: number; isFinished: boolean }>(
        "get_wizard_state",
      ),
    setWizardState: (state) => platform.invoke("set_wizard_state", state),
    hasPreferencesFile: (fileName: string) =>
      platform.fs.exists(fileName, { baseDir: "AppConfig" }),
    readPreferencesFile: (fileName: string) =>
      platform.fs.readTextFile(fileName, { baseDir: "AppConfig" }),
    writePreferencesFile: async (fileName: string, content: string) => {
      await platform.fs.mkdir("", { baseDir: "AppConfig", recursive: true });
      await platform.fs.writeTextFile(fileName, content, {
        baseDir: "AppConfig",
      });
    },
  });

  setSystemPort({
    openExternalUrl: (url: string) =>
      platform.invoke("open_external_url", { url }),
    deleteTempFile: (path: string) =>
      platform.invoke("delete_temp_file", { path }),
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
