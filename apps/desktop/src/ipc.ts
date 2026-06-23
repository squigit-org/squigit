import { ipcMain } from "electron";

let addon: any;
try {
  addon = require("napi-bridge");
} catch (e) {
  console.error("Failed to load napi-bridge native addon:", e);
  addon = {};
}

export function setupIpc() {
  // Profile commands
  ipcMain.handle("get_active_profile_id", () => addon.getActiveProfileId?.());
  ipcMain.handle("get_store_base_dir", () => addon.getStoreBaseDir?.());
  ipcMain.handle("set_active_profile", (_, args) =>
    addon.setActiveProfile?.(args.profileId || args.profile_id),
  );
  ipcMain.handle("clear_active_profile", () => addon.clearActiveProfile?.());
  ipcMain.handle("list_profiles", () => addon.listProfiles?.());
  ipcMain.handle("get_profile", (_, args) =>
    addon.getProfile?.(args.profileId || args.profile_id),
  );
  ipcMain.handle("delete_profile", (_, args) =>
    addon.deleteProfile?.(args.profileId || args.profile_id),
  );
  ipcMain.handle("has_profiles", () => addon.hasProfiles?.());
  ipcMain.handle("start_google_auth", () => addon.startGoogleAuth?.());
  ipcMain.handle("cancel_google_auth", () => addon.cancelGoogleAuth?.());
  ipcMain.handle("save_api_key", (_, args) =>
    addon.saveApiKey?.(
      args.profileId || args.profile_id,
      args.provider,
      args.key,
    ),
  );
  ipcMain.handle("get_api_key", (_, args) =>
    addon.getApiKey?.(args.profileId || args.profile_id, args.provider),
  );

  // Storage commands
  ipcMain.handle("storage_get", (_, args) => addon.storageGet?.(args.key));
  ipcMain.handle("storage_set", (_, args) =>
    addon.storageSet?.(args.key, args.value),
  );
  ipcMain.handle("storage_delete", (_, args) =>
    addon.storageDelete?.(args.key),
  );
  ipcMain.handle("store_image_from_path", (_, args) =>
    addon.storeImageFromPath?.(args.path),
  );
  ipcMain.handle("read_clipboard_image", () => addon.readClipboardImage?.());
  
  ipcMain.handle("create_chat", (_, args) => 
    addon.createChat?.(args.title, args.imageHash, args.ocrLang)
  );

  ipcMain.handle("cancel_request", (_, args) => addon.cancelRequest?.(args.channelId));
  
  ipcMain.handle("stream_chat", async (event, args) => {
    return addon.streamChat?.(
      args.apiKey, args.model, args.isInitialTurn, args.imagePath, args.imageDescription,
      args.userFirstMsg, args.historyLog, args.rollingSummary, args.userMessage,
      args.channelId, args.chatId, args.userName, args.userEmail, args.userInstruction,
      args.imageBrief,
      (err: any, streamEvent: any) => {
        if (err) {
          event.sender.send(args.channelId, { eventType: "error", message: err.message });
        } else {
          event.sender.send(args.channelId, streamEvent);
        }
      }
    );
  });

  ipcMain.handle("append_chat_message", (_, args) => addon.appendChatMessage?.(args.chatId, args.role, args.content));
  ipcMain.handle("update_chat_metadata", (_, args) => addon.updateChatMetadata?.(args.metadata));
  ipcMain.handle("generate_image_brief", (_, args) => addon.generateImageBrief?.(args.apiKey, args.imagePath, args.model));
  ipcMain.handle("load_chat", (_, args) => addon.loadChat?.(args.chatId));
  ipcMain.handle("delete_chat", (_, args) => addon.deleteChat?.(args.chatId));
  ipcMain.handle("get_imgbb_url", (_, args) => addon.getImgbbUrl?.(args.chatId));
  ipcMain.handle("get_image_path", (_, args) => addon.getImagePath?.(args.hash));
  ipcMain.handle("save_imgbb_url", (_, args) => addon.saveImgbbUrl?.(args.chatId, args.url));
  ipcMain.handle("get_rolling_summary", (_, args) => addon.getRollingSummary?.(args.chatId));
  ipcMain.handle("save_rolling_summary", (_, args) => addon.saveRollingSummary?.(args.chatId, args.summary));
  ipcMain.handle("generate_chat_title", (_, args) => addon.generateChatTitle?.(args.apiKey, args.model, args.promptContext));
  ipcMain.handle("compress_conversation", (_, args) => addon.compressConversation?.(args.apiKey, args.imageBrief, args.historyToCompress, args.model));
  
  ipcMain.handle("prompt_chat", async (event, args) => {
    return addon.promptChat?.(args.chatId, args.model, args.userMessage, (err: any, streamEvent: any) => {
        if (err) {
            event.sender.send(args.channelId, { eventType: "error", message: err.message });
        } else {
            event.sender.send(args.channelId, streamEvent);
        }
    });
  });

  ipcMain.handle("analyze_image", async (event, args) => {
    return addon.analyzeImage?.(args.imagePath, args.model, args.userMessage, (err: any, streamEvent: any) => {
        if (err) {
            event.sender.send(args.channelId, { eventType: "error", message: err.message });
        } else {
            event.sender.send(args.channelId, streamEvent);
        }
    });
  });

  ipcMain.handle("detect_image_tone", async (_, args) => {
    try {
      const fs = require("fs/promises");
      const buf = await fs.readFile(args.path || args.imagePath);
      return addon.detectImageTone?.(buf) || "dark";
    } catch (e) {
      console.error("detect_image_tone error:", e);
      return "dark";
    }
  });

  const getChatDir = (chatId: string) => {
    const path = require("path");
    const base = addon.getStoreBaseDir?.();
    const active = addon.getActiveProfileId?.();
    if (!base || !active) throw new Error("No active profile");
    return path.join(base, active, "chats", chatId);
  };

  ipcMain.handle("store_image_bytes", async (_, args) => {
    const fs = require("fs/promises");
    const path = require("path");
    const { app } = require("electron");
    const tmpPath = path.join(app.getPath("temp"), `squigit_tmp_${Date.now()}.png`);
    await fs.writeFile(tmpPath, Buffer.from(args.bytes));
    const result = addon.storeImageFromPath?.(tmpPath);
    await fs.unlink(tmpPath).catch(() => {});
    return result;
  });

  ipcMain.handle("store_file_from_path", (_, args) => addon.storeImageFromPath?.(args.path));
  ipcMain.handle("validate_text_file", () => true);
  ipcMain.handle("resolve_attachment_path", (_, args) => args.path);
  
  ipcMain.handle("read_attachment_text", async (_, args) => {
    const fs = require("fs/promises");
    return await fs.readFile(args.path, "utf-8");
  });

  ipcMain.handle("search_chats", () => []);

  ipcMain.handle("overwrite_chat_messages", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const msgPath = require("path").join(getChatDir(args.chatId), "messages.json");
      await fs.writeFile(msgPath, JSON.stringify(args.messages, null, 2));
    } catch (e) { console.error("overwrite_chat_messages error", e); }
  });

  ipcMain.handle("save_ocr_data", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const chatDir = getChatDir(args.chatId);
      await fs.mkdir(chatDir, { recursive: true });
      const framePath = require("path").join(chatDir, "ocr_frame.json");
      let frame: any = {};
      try { frame = JSON.parse(await fs.readFile(framePath, "utf-8")); } catch {}
      frame[args.modelId || "eng"] = args.ocrData;
      await fs.writeFile(framePath, JSON.stringify(frame, null, 2));
    } catch (e) { console.error("save_ocr_data error", e); }
  });

  ipcMain.handle("get_ocr_data", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const framePath = require("path").join(getChatDir(args.chatId), "ocr_frame.json");
      const frame = JSON.parse(await fs.readFile(framePath, "utf-8"));
      return frame[args.modelId || "eng"] || null;
    } catch { return null; }
  });

  ipcMain.handle("get_ocr_frame", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const framePath = require("path").join(getChatDir(args.chatId), "ocr_frame.json");
      return JSON.parse(await fs.readFile(framePath, "utf-8"));
    } catch { return {}; }
  });

  ipcMain.handle("init_ocr_frame", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const chatDir = getChatDir(args.chatId);
      await fs.mkdir(chatDir, { recursive: true });
      const framePath = require("path").join(chatDir, "ocr_frame.json");
      let frame: any = {};
      try { frame = JSON.parse(await fs.readFile(framePath, "utf-8")); } catch {}
      for (const modelId of (args.modelIds || [])) {
        if (!(modelId in frame)) frame[modelId] = null;
      }
      await fs.writeFile(framePath, JSON.stringify(frame, null, 2));
    } catch (e) { console.error("init_ocr_frame error", e); }
  });

  ipcMain.handle("save_image_tone", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const metaPath = require("path").join(getChatDir(args.chatId), "meta.json");
      const meta = JSON.parse(await fs.readFile(metaPath, "utf-8"));
      meta.image_tone = args.tone;
      meta.updated_at = new Date().toISOString();
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    } catch (e) { console.error("save_image_tone error", e); }
  });

  ipcMain.handle("save_image_brief", async (_, args) => {
    const fs = require("fs/promises");
    try {
      const chatDir = getChatDir(args.chatId);
      await fs.mkdir(chatDir, { recursive: true });
      const briefPath = require("path").join(chatDir, "image_brief.txt");
      await fs.writeFile(briefPath, args.brief);
    } catch (e) { console.error("save_image_brief error", e); }
  });

  ipcMain.handle("spawn_capture", () => {});
  ipcMain.handle("process_image_path", (_, args) => addon.processImagePath?.(args.path));
  ipcMain.handle("read_image_file", async (_, args) => {
    const fs = require("fs/promises");
    const buf = await fs.readFile(args.path);
    return Array.from(buf);
  });
  ipcMain.handle("copy_image_to_clipboard", (_, args) => addon.copyImageToClipboard?.(args.base64Data));
  ipcMain.handle("copy_image_from_path_to_clipboard", (_, args) => addon.copyImageFromPathToClipboard?.(args.path));

  // Brain commands
  ipcMain.handle("ai_prompt", (_, args) =>
    addon.aiPrompt?.(args.messages, args.settings, args.image_path),
  );
  ipcMain.handle("ai_title", (_, args) =>
    addon.aiTitle?.(args.messages, args.settings),
  );

  // File system and other Electron-specific shims
  // The renderer expects some platform.fs methods
  const fs = require("fs/promises");
  const path = require("path");
  const { app } = require("electron");

  const resolveFsPath = (args: any) => {
    let targetPath = args.path;
    if (args.baseDir === "AppConfig") {
      const configDir = path.join(app.getPath("appData"), "squigit");
      targetPath = path.join(configDir, args.path);
    }
    return targetPath;
  };

  ipcMain.handle("fs:exists", async (_, args) => {
    try {
      await fs.access(resolveFsPath(args));
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("fs:readTextFile", async (_, args) => {
    return await fs.readFile(resolveFsPath(args), "utf-8");
  });

  ipcMain.handle("fs:writeTextFile", async (_, args) => {
    await fs.writeFile(resolveFsPath(args), args.content, "utf-8");
  });

  ipcMain.handle("fs:mkdir", async (_, args) => {
    await fs.mkdir(resolveFsPath(args), { recursive: args.recursive });
  });

  ipcMain.handle("fs:removeFile", async (_, args) => {
    try {
      await fs.unlink(resolveFsPath(args));
    } catch {
      // ignore error if file doesn't exist
    }
  });

  // App commands
  ipcMain.handle("app:getVersion", () => "0.1.0");
  ipcMain.handle("app:getRuntimeVersion", () => process.versions.electron);
  ipcMain.handle("app:exit", (_, args) =>
    require("electron").app.exit(args?.code || 0),
  );
  ipcMain.handle("app:relaunch", () => {
    require("electron").app.relaunch();
    require("electron").app.exit(0);
  });

  // Shims for missing Tauri handlers
  ipcMain.handle("list_downloaded_models", () => []);
  ipcMain.handle("get_linux_package_manager", () => "apt");
  ipcMain.handle("get_machine_info", () => addon.getMachineInfo?.());
  ipcMain.handle("set_background_color", () => {});
  ipcMain.handle("get_app_constants", () => ({ appVersion: "0.2.0" }));
  ipcMain.handle("get_system_theme", () => "dark");
  ipcMain.handle("run_sidecar_version", (_, args) => addon.runSidecarVersion?.(args.command));
  ipcMain.handle("updater:check", () => null);
  ipcMain.handle("get_initial_image", () => null);
  ipcMain.handle(
    "has_agreed_flag",
    () => addon.storageGet?.("agreed_flag") === "true",
  );
  ipcMain.handle("get_wizard_state", async () => {
    try {
      const fs = require("fs/promises");
      const path = require("path");
      const { app } = require("electron");
      const userData = app.getPath("userData");
      const data = await fs.readFile(
        path.join(userData, "wizard_state.json"),
        "utf-8",
      );
      return JSON.parse(data);
    } catch {
      const defaultState = {
        step: 0,
        isFinished: false,
        data: {
          step_3: { theme: "dark", captureType: "rectangular", ocrEnabled: true, autoExpandOCR: true },
          step_4: { agreed: false },
        },
      };
      try {
        const fs = require("fs/promises");
        const path = require("path");
        const { app } = require("electron");
        const userData = app.getPath("userData");
        await fs.writeFile(
          path.join(userData, "wizard_state.json"),
          JSON.stringify(defaultState, null, 2),
          "utf-8",
        );
      } catch (err) {
        console.error("Failed to pre-create wizard_state.json", err);
      }
      return defaultState;
    }
  });
  ipcMain.handle("set_wizard_state", async (_, state) => {
    const fs = require("fs/promises");
    const path = require("path");
    const { app } = require("electron");
    const userData = app.getPath("userData");
    await fs.writeFile(
      path.join(userData, "wizard_state.json"),
      JSON.stringify(state),
    );
  });
  ipcMain.handle("logout", () => addon.clearActiveProfile?.());
  ipcMain.handle("cache_avatar", () => null);
  ipcMain.handle("encrypt_and_save", (_, args) =>
    addon.saveApiKey?.(
      args.profileId || args.profile_id,
      args.provider,
      args.plaintext,
    ),
  );
  ipcMain.handle("get_profile_count", () => addon.profileCount?.());
  ipcMain.handle("cancel_download_ocr_model", () => {});
  ipcMain.handle("cancel_ocr_job", () => {});
  ipcMain.handle("quick_answer_request", (_, args) =>
    addon.requestQuickAnswer?.(args.channelId),
  );
  ipcMain.handle("play_ui_sound", () => {});

  ipcMain.handle("list_chats", () => {
    try {
      return addon.listChats?.() || [];
    } catch {
      return [];
    }
  });
  ipcMain.handle("get_active_profile", () => {
    try {
      const id = addon.getActiveProfileId?.();
      if (id) return addon.getProfile?.(id) || null;
    } catch {}
    return null;
  });

  // Window commands
  ipcMain.handle("close_window", () =>
    require("electron").BrowserWindow.getFocusedWindow()?.close(),
  );
  ipcMain.handle("minimize_window", () =>
    require("electron").BrowserWindow.getFocusedWindow()?.minimize(),
  );
  ipcMain.handle("maximize_window", () => {
    const win = require("electron").BrowserWindow.getFocusedWindow();
    if (win?.isMaximized()) win.unmaximize();
    else win?.maximize();
  });
  ipcMain.handle("set_always_on_top", (_, args) =>
    require("electron")
      .BrowserWindow.getFocusedWindow()
      ?.setAlwaysOnTop(args.state),
  );
  ipcMain.handle("window:startDragging", () => {});
  ipcMain.handle("reveal_in_file_manager", (_, args) =>
    require("electron").shell.showItemInFolder(args.path),
  );
  ipcMain.handle("open_external_url", (_, args) =>
    require("electron").shell.openExternal(args.url),
  );

  // Dialog
  ipcMain.handle("dialog:open", async (_, options) => {
    const { dialog: electronDialog } = require("electron");
    const filters = (options?.filters || []).map((f: any) => ({
      name: f.name || "Files",
      extensions: f.extensions || ["*"],
    }));
    let defaultPath: string | undefined;
    if (options?.defaultPath) {
      try {
        const knownDirs: Record<string, string> = {
          Documents: app.getPath("documents"),
          Home: app.getPath("home"),
          Desktop: app.getPath("desktop"),
          Downloads: app.getPath("downloads"),
        };
        defaultPath = knownDirs[options.defaultPath] || options.defaultPath;
      } catch {
        // ignore — let the OS pick its own default
      }
    }
    const result = await electronDialog.showOpenDialog({
      properties: options?.multiple ? ["openFile", "multiSelections"] : ["openFile"],
      filters: filters.length > 0 ? filters : undefined,
      defaultPath,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return options?.multiple ? result.filePaths : result.filePaths[0];
  });
}
