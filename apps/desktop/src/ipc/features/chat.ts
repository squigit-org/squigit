import { ipcMain } from "electron";
import { addon, parseAddonJson, requireAddonFn } from "../system/addon";
import { optionalStringArg, requireStringArg } from "../system/arguments";
import { sendStreamEvent } from "./stream";

export const getChatDir = (chatId: string) => {
  const path = require("path");
  const base = addon.getStoreBaseDir?.();
  const active = addon.getActiveProfileId?.();
  if (!base || !active) throw new Error("No active profile");
  return path.join(base, active, "chats", chatId);
};

export function registerChatHandlers() {
  ipcMain.handle("create_chat", (_, args) => {
    const json = requireAddonFn("createChatJson")(
      requireStringArg("create_chat", args, "title"),
      requireStringArg("create_chat", args, "imageHash", "image_hash"),
      optionalStringArg(args, "ocrLang", "ocr_lang"),
    );
    return parseAddonJson("create_chat", json);
  });

  ipcMain.handle("cancel_request", (_, args) => addon.cancelRequest?.(args.channelId));

  ipcMain.handle("stream_chat", async (event, args) => {
    return addon.streamChat?.(
      args.apiKey, args.model, args.isInitialTurn, args.imagePath, args.imageDescription,
      args.userFirstMsg, args.historyLog, args.rollingSummary, args.userMessage,
      args.channelId, args.chatId, args.userName, args.userEmail, args.userInstruction,
      args.imageBrief,
      (err: any, streamEvent: any) => {
        sendStreamEvent(event, args.channelId, err, streamEvent);
      }
    );
  });

  ipcMain.handle("append_chat_message", (_, args) => addon.appendChatMessage?.(args.chatId, args.role, args.content));
  ipcMain.handle("update_chat_metadata", (_, args) => {
    if (!args?.metadata || typeof args.metadata !== "object") {
      throw new Error("update_chat_metadata requires metadata.");
    }
    return requireAddonFn("updateChatMetadataJson")(
      JSON.stringify(args.metadata),
    );
  });
  ipcMain.handle("generate_image_brief", (_, args) => addon.generateImageBrief?.(args.apiKey, args.imagePath, args.model));
  ipcMain.handle("load_chat", (_, args) => {
    const json = requireAddonFn("loadChatJson")(
      requireStringArg("load_chat", args, "chatId", "chat_id"),
    );
    return parseAddonJson("load_chat", json);
  });
  ipcMain.handle("delete_chat", (_, args) => addon.deleteChat?.(args.chatId));
  ipcMain.handle("get_imgbb_url", (_, args) => addon.getImgbbUrl?.(args.chatId));
  ipcMain.handle("get_image_path", (_, args) =>
    addon.getImagePath?.(
      requireStringArg("get_image_path", args, "hash", "imageHash", "image_hash"),
    ),
  );
  ipcMain.handle("save_imgbb_url", (_, args) => addon.saveImgbbUrl?.(args.chatId, args.url));
  ipcMain.handle("get_rolling_summary", (_, args) => addon.getRollingSummary?.(args.chatId));
  ipcMain.handle("save_rolling_summary", (_, args) => addon.saveRollingSummary?.(args.chatId, args.summary));
  ipcMain.handle("generate_chat_title", (_, args) => addon.generateChatTitle?.(args.apiKey, args.model, args.promptContext));
  ipcMain.handle("compress_conversation", (_, args) => addon.compressConversation?.(args.apiKey, args.imageBrief, args.historyToCompress, args.model));

  ipcMain.handle("prompt_chat", async (event, args) => {
    return addon.promptChat?.(args.chatId, args.model, args.userMessage, (err: any, streamEvent: any) => {
        sendStreamEvent(event, args.channelId, err, streamEvent);
    });
  });

  ipcMain.handle("search_chats", (_, args) => {
    const query = (args.query || "").trim();
    if (!query) return [];
    const limit = args.limit || 60;

    let isRegex = false;
    let regex: RegExp | null = null;
    let tokens: string[] = [];

    if (query.startsWith("re:")) {
      isRegex = true;
      try { regex = new RegExp(query.substring(3), "i"); } catch {}
    } else if (query.startsWith("/") && query.endsWith("/") && query.length > 2) {
      isRegex = true;
      try { regex = new RegExp(query.slice(1, -1), "i"); } catch {}
    } else {
      tokens = query
        .split(/\s+/)
        .map((s: string) => s.replace(/^[-+]/, "").toLowerCase().replace(/[^a-z0-9]/g, ""))
        .filter((s: string) => s.length >= 2);
      tokens = [...new Set(tokens)].sort((a, b) => b.length - a.length).slice(0, 8);
    }

    const json = requireAddonFn("listChatsJson")();
    const chats = parseAddonJson("list_chats", json);
    const results: any[] = [];

    for (const chat of chats) {
      try {
        const chatJson = requireAddonFn("loadChatJson")(chat.id);
        const chatData = parseAddonJson("load_chat", chatJson);
        const messages = chatData.messages || [];

        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          const content = msg.content || "";
          let matched = false;
          let matchIndex = -1;
          let score = 0;

          if (isRegex) {
            if (regex) {
              const match = regex.exec(content);
              if (match) {
                matched = true;
                matchIndex = match.index;
                score = 100;
              }
            }
          } else if (tokens.length > 0) {
            const lowerContent = content.toLowerCase();
            let allMatched = true;
            let firstMatchIndex = -1;

            for (const token of tokens) {
              const idx = lowerContent.indexOf(token);
              if (idx === -1) {
                allMatched = false;
                break;
              }
              if (firstMatchIndex === -1) {
                firstMatchIndex = idx;
              }
            }

            if (allMatched) {
              matched = true;
              matchIndex = firstMatchIndex;
              score = tokens.length * 10;
            }
          } else {
            const lowerContent = content.toLowerCase();
            const lowerQuery = query.toLowerCase();
            matchIndex = lowerContent.indexOf(lowerQuery);
            if (matchIndex !== -1) {
              matched = true;
              score = 50;
            }
          }

          if (matched) {
            const padding = 40;
            const start = Math.max(0, matchIndex - padding);
            const end = Math.min(content.length, matchIndex + query.length + padding);
            let snippet = content.substring(start, end).replace(/\n/g, " ");
            if (start > 0) snippet = "..." + snippet;
            if (end < content.length) snippet = snippet + "...";

            results.push({
              chat_id: chat.id,
              chat_title: chat.title,
              chat_created_at: chat.created_at,
              chat_updated_at: chat.updated_at,
              message_index: i,
              message_role: msg.role,
              message_timestamp: msg.timestamp,
              snippet,
              score,
            });
          }
        }
      } catch (e) {
        // ignore individual chat read errors
      }
    }

    results.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const timeA = new Date(a.chat_updated_at || a.chat_created_at).getTime();
      const timeB = new Date(b.chat_updated_at || b.chat_created_at).getTime();
      return timeB - timeA;
    });

    return results.slice(0, limit);
  });

  ipcMain.handle("overwrite_chat_messages", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const msgPath = require("path").join(getChatDir(args.chatId), "messages.json");
      await fs.writeFile(msgPath, JSON.stringify(args.messages, null, 2));
    } catch (e) { console.error("overwrite_chat_messages error", e); }
  });

  ipcMain.handle("save_image_tone", (_, args) =>
    requireAddonFn("saveImageTone")(
      requireStringArg("save_image_tone", args, "chatId", "chat_id"),
      requireStringArg("save_image_tone", args, "tone"),
    ),
  );

  ipcMain.handle("save_image_brief", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const chatDir = getChatDir(args.chatId);
      await fs.mkdir(chatDir, { recursive: true });
      const briefPath = require("path").join(chatDir, "image_brief.txt");
      await fs.writeFile(briefPath, args.brief);
    } catch (e) { console.error("save_image_brief error", e); }
  });

  ipcMain.handle("list_chats", () => {
    const json = requireAddonFn("listChatsJson")();
    return parseAddonJson("list_chats", json);
  });
  // Brain commands
  ipcMain.handle("ai_prompt", (_, args) =>
    addon.aiPrompt?.(args.messages, args.settings, args.image_path),
  );
  ipcMain.handle("ai_title", (_, args) =>
    addon.aiTitle?.(args.messages, args.settings),
  );
  ipcMain.handle("quick_answer_request", (_, args) =>
    addon.requestQuickAnswer?.(args.channelId),
  );

  // Chat input / STT
  ipcMain.handle("start_stt", () => { throw new Error("ERR_MISSING_STT_PACKAGE"); });
  ipcMain.handle("stop_stt", () => {});
}
