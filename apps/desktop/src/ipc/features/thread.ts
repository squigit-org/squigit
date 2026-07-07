import { ipcMain } from "electron";
import { addon, parseAddonJson, requireAddonFn } from "../system/addon";
import { optionalStringArg, requireStringArg } from "../system/arguments";
import { sendStreamEvent } from "./stream";

export const getThreadDir = (threadId: string) => {
  const path = require("path");
  const base = addon.getStoreBaseDir?.();
  const active = addon.getActiveProfileId?.();
  if (!base || !active) throw new Error("No active profile");
  return path.join(base, active, "threads", threadId);
};

export function registerThreadHandlers() {
  ipcMain.handle("create_thread", (_, args) => {
    const json = requireAddonFn("createThreadJson")(
      requireStringArg("create_thread", args, "title"),
      requireStringArg("create_thread", args, "imageHash", "image_hash"),
      optionalStringArg(args, "ocrLang", "ocr_lang"),
    );
    return parseAddonJson("create_thread", json);
  });

  ipcMain.handle("cancel_request", (_, args) =>
    addon.cancelRequest?.(args.channelId),
  );

  ipcMain.handle("stream_thread", async (event, args) => {
    return addon.streamThread?.(
      args.apiKey,
      args.model,
      args.isInitialTurn,
      args.imagePath,
      args.imageDescription,
      args.userFirstMsg,
      args.historyLog,
      args.rollingSummary,
      args.userMessage,
      args.channelId,
      args.threadId,
      args.userName,
      args.userEmail,
      args.imageBrief,
      (err: any, streamEvent: any) => {
        sendStreamEvent(event, args.channelId, err, streamEvent);
      },
    );
  });

  ipcMain.handle("append_thread_message", (_, args) =>
    addon.appendThreadMessage?.(args.threadId, args.role, args.content),
  );
  ipcMain.handle("update_thread_metadata", (_, args) => {
    if (!args?.metadata || typeof args.metadata !== "object") {
      throw new Error("update_thread_metadata requires metadata.");
    }
    return requireAddonFn("updateThreadMetadataJson")(
      JSON.stringify(args.metadata),
    );
  });
  ipcMain.handle("generate_image_brief", (_, args) =>
    addon.generateImageBrief?.(args.apiKey, args.imagePath, args.model),
  );
  ipcMain.handle("load_thread", (_, args) => {
    const json = requireAddonFn("loadThreadJson")(
      requireStringArg("load_thread", args, "threadId", "thread_id"),
    );
    return parseAddonJson("load_thread", json);
  });
  ipcMain.handle("delete_thread", (_, args) =>
    addon.deleteThread?.(args.threadId),
  );
  ipcMain.handle("get_reverse_image_search_url", (_, args) =>
    addon.getReverseImageSearchUrl?.(args.threadId),
  );
  ipcMain.handle("get_image_path", (_, args) =>
    addon.getImagePath?.(
      requireStringArg(
        "get_image_path",
        args,
        "hash",
        "imageHash",
        "image_hash",
      ),
    ),
  );
  ipcMain.handle("save_reverse_image_search_url", (_, args) =>
    addon.saveReverseImageSearchUrl?.(args.threadId, args.url),
  );
  ipcMain.handle("get_rolling_summary", (_, args) =>
    addon.getRollingSummary?.(args.threadId),
  );
  ipcMain.handle("save_rolling_summary", (_, args) =>
    addon.saveRollingSummary?.(args.threadId, args.summary),
  );
  ipcMain.handle("generate_thread_title", (_, args) =>
    addon.generateThreadTitle?.(args.apiKey, args.model, args.promptContext),
  );
  ipcMain.handle("compress_conversation", (_, args) =>
    addon.compressConversation?.(
      args.apiKey,
      args.imageBrief,
      args.historyToCompress,
      args.model,
    ),
  );

  ipcMain.handle("prompt_thread", async (event, args) => {
    return addon.promptThread?.(
      args.threadId,
      args.model,
      args.userMessage,
      (err: any, streamEvent: any) => {
        sendStreamEvent(event, args.channelId, err, streamEvent);
      },
    );
  });

  ipcMain.handle("search_threads", (_, args) => {
    const query = (args.query || "").trim();
    if (!query) return [];
    const limit = args.limit || 60;

    let isRegex = false;
    let regex: RegExp | null = null;
    let tokens: string[] = [];

    if (query.startsWith("re:")) {
      isRegex = true;
      try {
        regex = new RegExp(query.substring(3), "i");
      } catch {}
    } else if (
      query.startsWith("/") &&
      query.endsWith("/") &&
      query.length > 2
    ) {
      isRegex = true;
      try {
        regex = new RegExp(query.slice(1, -1), "i");
      } catch {}
    } else {
      tokens = query
        .split(/\s+/)
        .map((s: string) =>
          s
            .replace(/^[-+]/, "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, ""),
        )
        .filter((s: string) => s.length >= 2);
      tokens = [...new Set(tokens)]
        .sort((a, b) => b.length - a.length)
        .slice(0, 8);
    }

    const json = requireAddonFn("listThreadsJson")();
    const threads = parseAddonJson("list_threads", json);
    const results: any[] = [];

    for (const thread of threads) {
      try {
        const threadJson = requireAddonFn("loadThreadJson")(thread.id);
        const threadData = parseAddonJson("load_thread", threadJson);
        const messages = threadData.messages || [];

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
            const end = Math.min(
              content.length,
              matchIndex + query.length + padding,
            );
            let snippet = content.substring(start, end).replace(/\n/g, " ");
            if (start > 0) snippet = "..." + snippet;
            if (end < content.length) snippet = snippet + "...";

            results.push({
              thread_id: thread.id,
              thread_title: thread.title,
              thread_created_at: thread.created_at,
              thread_updated_at: thread.updated_at,
              message_index: i,
              message_role: msg.role,
              message_timestamp: msg.timestamp,
              snippet,
              score,
            });
          }
        }
      } catch (e) {
        // ignore individual thread read errors
      }
    }

    results.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const timeA = new Date(
        a.thread_updated_at || a.thread_created_at,
      ).getTime();
      const timeB = new Date(
        b.thread_updated_at || b.thread_created_at,
      ).getTime();
      return timeB - timeA;
    });

    return results.slice(0, limit);
  });

  ipcMain.handle("overwrite_thread_messages", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const msgPath = require("path").join(
        getThreadDir(args.threadId),
        "messages.json",
      );
      await fs.writeFile(msgPath, JSON.stringify(args.messages, null, 2));
    } catch (e) {
      console.error("overwrite_thread_messages error", e);
    }
  });

  ipcMain.handle("save_image_tone", (_, args) =>
    requireAddonFn("saveImageTone")(
      requireStringArg("save_image_tone", args, "threadId", "thread_id"),
      requireStringArg("save_image_tone", args, "tone"),
    ),
  );

  ipcMain.handle("save_image_brief", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const threadDir = getThreadDir(args.threadId);
      const metaPath = require("path").join(threadDir, "meta.json");
      const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
      meta.image_brief = args.brief;
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch (e) {
      console.error("save_image_brief error", e);
    }
  });

  ipcMain.handle("list_threads", () => {
    const json = requireAddonFn("listThreadsJson")();
    return parseAddonJson("list_threads", json);
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

  // Thread input / STT
  ipcMain.handle("start_stt", () => {
    throw new Error("ERR_MISSING_STT_PACKAGE");
  });
  ipcMain.handle("stop_stt", () => {});
}
