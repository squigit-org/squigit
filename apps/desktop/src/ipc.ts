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
    const result = await electronDialog.showOpenDialog({
      properties: options?.multiple ? ["openFile", "multiSelections"] : ["openFile"],
      filters: filters.length > 0 ? filters : undefined,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return options?.multiple ? result.filePaths : result.filePaths[0];
  });
}
